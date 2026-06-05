import type { FmOperator, FmPatch, NoteEvent, PatchRegistry } from "../mml/types";

const attackSec = 0.008;
const slurAttackSec = 0.001;
const releaseSec = 0.025;
const connectedReleaseSec = 0.006;

type SynthAudioContext = BaseAudioContext & {
  destination: AudioNode;
};

export class Synth {
  private masterGain: GainNode;

  constructor(private readonly audioContext: SynthAudioContext) {
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 0.75;
    this.masterGain.connect(audioContext.destination);
  }

  schedule(event: NoteEvent, startAt: number, patches: PatchRegistry): void {
    if (event.frequencyHz === null || event.gateDurationSec <= 0 || event.volume <= 0) {
      return;
    }

    const gain = this.audioContext.createGain();
    const endAt = startAt + event.gateDurationSec;
    const envelopeEndAt = event.connectedToNext ? endAt + connectedReleaseSec : endAt;
    const noteAttackSec = event.slurred ? slurAttackSec : attackSec;
    const releaseStart = event.connectedToNext ? endAt : Math.max(startAt + noteAttackSec, endAt - releaseSec);
    const peak = Math.min(Math.max(event.volume, 0), 1);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), startAt + noteAttackSec);
    gain.gain.setValueAtTime(Math.max(peak, 0.0001), releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, envelopeEndAt);
    gain.connect(this.masterGain);

    const gmPatch = event.gmProgram === null ? undefined : patches.gmPatches.get(event.gmProgram);
    if (gmPatch?.fmPatch) {
      this.scheduleUserFm(event, gmPatch.fmPatch, gain, startAt, envelopeEndAt);
      return;
    }
    const eventTimbre = gmPatch?.builtinTimbre ?? event.timbre;

    const userFmPatch = patches.userFmPatches.get(event.timbre);
    if (!gmPatch && userFmPatch) {
      this.scheduleUserFm(event, userFmPatch, gain, startAt, envelopeEndAt);
      return;
    }

    if (eventTimbre === 4 || eventTimbre === 5) {
      this.scheduleFm(event, eventTimbre, gain, startAt, envelopeEndAt);
      return;
    }

    if (eventTimbre === 6) {
      this.scheduleNoise(event, gain, startAt, envelopeEndAt);
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    oscillator.type = oscillatorTypeForTimbre(eventTimbre);
    oscillator.frequency.setValueAtTime(event.frequencyHz, startAt);

    oscillator.connect(gain);
    oscillator.start(startAt);
    oscillator.stop(envelopeEndAt + 0.01);
  }

  private scheduleFm(event: NoteEvent, timbre: number, output: GainNode, startAt: number, endAt: number): void {
    if (event.frequencyHz === null) return;

    const carrier = this.audioContext.createOscillator();
    const modulator = this.audioContext.createOscillator();
    const modGain = this.audioContext.createGain();
    const isBass = timbre === 5;

    carrier.type = isBass ? "triangle" : "sine";
    modulator.type = "sine";
    carrier.frequency.setValueAtTime(event.frequencyHz, startAt);
    modulator.frequency.setValueAtTime(event.frequencyHz * (isBass ? 1 : 2), startAt);

    const modulationDepth = event.frequencyHz * (isBass ? 0.75 : 2.4);
    modGain.gain.setValueAtTime(modulationDepth, startAt);
    modGain.gain.exponentialRampToValueAtTime(Math.max(event.frequencyHz * 0.08, 1), endAt);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(output);

    carrier.start(startAt);
    modulator.start(startAt);
    carrier.stop(endAt + 0.01);
    modulator.stop(endAt + 0.01);
  }

  private scheduleNoise(event: NoteEvent, output: GainNode, startAt: number, endAt: number): void {
    const durationSec = Math.max(endAt - startAt + 0.02, 0.02);
    const frameCount = Math.ceil(this.audioContext.sampleRate * durationSec);
    const buffer = this.audioContext.createBuffer(1, frameCount, this.audioContext.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    const source = this.audioContext.createBufferSource();
    const filter = this.audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(Math.max(event.frequencyHz ?? 1200, 80), startAt);
    filter.Q.setValueAtTime(0.8, startAt);

    source.buffer = buffer;
    source.connect(filter);
    filter.connect(output);
    source.start(startAt);
    source.stop(endAt + 0.01);
  }

  private scheduleUserFm(event: NoteEvent, patch: FmPatch, output: GainNode, startAt: number, endAt: number): void {
    if (event.frequencyHz === null) return;
    const baseFrequencyHz = event.frequencyHz;

    const oscillators = patch.operators.map((operator) => {
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(baseFrequencyHz * operator.ratio + operator.detune, startAt);
      oscillator.connect(gain);
      return { oscillator, gain, operator };
    });

    const carrier = oscillators[0];
    applyAdsr(carrier.gain.gain, carrier.operator, startAt, endAt);
    carrier.gain.connect(output);

    for (let index = 1; index < oscillators.length; index += 1) {
      applyAdsr(oscillators[index].gain.gain, oscillators[index].operator, startAt, endAt, modulationScale(baseFrequencyHz, patch.feedback));
      oscillators[index].gain.connect(oscillators[index - 1].oscillator.frequency);
    }

    for (const voice of oscillators) {
      voice.oscillator.start(startAt);
      voice.oscillator.stop(endAt + voice.operator.release + 0.01);
    }
  }

  disconnect(): void {
    this.masterGain.disconnect();
  }
}

function modulationScale(frequencyHz: number, feedback: number): number {
  return frequencyHz * (1 + feedback * 0.12);
}

function applyAdsr(param: AudioParam, operator: FmOperator, startAt: number, endAt: number, scale = 1): void {
  const peak = operator.level * scale;
  const attackEnd = Math.min(startAt + Math.max(operator.attack, 0.001), endAt);
  const decayEnd = Math.min(attackEnd + Math.max(operator.decay, 0.001), endAt);
  const releaseEnd = endAt + operator.release;
  const sustain = operator.sustain * peak;

  param.setValueAtTime(0, startAt);
  param.linearRampToValueAtTime(peak, attackEnd);
  if (attackEnd < endAt) {
    param.linearRampToValueAtTime(sustain, decayEnd);
  }
  param.setValueAtTime(attackEnd < endAt ? sustain : peak, endAt);
  param.linearRampToValueAtTime(0, Math.max(releaseEnd, endAt + 0.001));
}

function oscillatorTypeForTimbre(timbre: number): OscillatorType {
  switch (timbre) {
    case 1:
      return "sine";
    case 2:
      return "triangle";
    case 3:
      return "sawtooth";
    default:
      return "square";
  }
}
