import type { NoteEvent } from "../mml/types";

const attackSec = 0.008;
const slurAttackSec = 0.001;
const releaseSec = 0.025;
const connectedReleaseSec = 0.006;

export class Synth {
  private masterGain: GainNode;

  constructor(private readonly audioContext: AudioContext) {
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 0.75;
    this.masterGain.connect(audioContext.destination);
  }

  schedule(event: NoteEvent, startAt: number): void {
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

    if (event.timbre === 4 || event.timbre === 5) {
      this.scheduleFm(event, gain, startAt, envelopeEndAt);
      return;
    }

    if (event.timbre === 6) {
      this.scheduleNoise(event, gain, startAt, envelopeEndAt);
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    oscillator.type = oscillatorTypeForTimbre(event.timbre);
    oscillator.frequency.setValueAtTime(event.frequencyHz, startAt);

    oscillator.connect(gain);
    oscillator.start(startAt);
    oscillator.stop(envelopeEndAt + 0.01);
  }

  private scheduleFm(event: NoteEvent, output: GainNode, startAt: number, endAt: number): void {
    if (event.frequencyHz === null) return;

    const carrier = this.audioContext.createOscillator();
    const modulator = this.audioContext.createOscillator();
    const modGain = this.audioContext.createGain();
    const isBass = event.timbre === 5;

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

  disconnect(): void {
    this.masterGain.disconnect();
  }
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
