import type { NoteEvent, Song } from "../mml/types";
import { Synth } from "./synth";

const defaultSampleRate = 44100;
const defaultTailSec = 1;
const wavHeaderBytes = 44;
const pcm16BytesPerSample = 2;

export interface AudioBufferLike {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface RenderSongToWavOptions {
  sampleRate?: number;
  tailSec?: number;
  renderAudio?: (song: Song, options: { sampleRate: number; durationSec: number }) => Promise<AudioBufferLike>;
}

export async function renderSongToWav(song: Song, options: RenderSongToWavOptions = {}): Promise<Blob> {
  const sampleRate = options.sampleRate ?? defaultSampleRate;
  const durationSec = songAudioDurationSec(song, options.tailSec ?? defaultTailSec);

  if (durationSec <= 0) {
    throw new Error("WAV export requires at least one audible note");
  }

  const rendered = options.renderAudio
    ? await options.renderAudio(song, { sampleRate, durationSec })
    : await renderSongAudio(song, sampleRate, durationSec);

  return encodeAudioBufferToWav(rendered);
}

export function estimateWavBytes(song: Song, sampleRate = defaultSampleRate, tailSec = defaultTailSec): number {
  const durationSec = songAudioDurationSec(song, tailSec);
  if (durationSec <= 0) return 0;
  return wavHeaderBytes + Math.ceil(durationSec * sampleRate) * pcm16BytesPerSample;
}

export function encodeAudioBufferToWav(buffer: AudioBufferLike): Blob {
  return encodePcm16Wav(mixToMono(buffer), buffer.sampleRate);
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * pcm16BytesPerSample;
  const bytes = new ArrayBuffer(wavHeaderBytes + dataBytes);
  const view = new DataView(bytes);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * pcm16BytesPerSample, true);
  view.setUint16(32, pcm16BytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples.length; index += 1) {
    const clipped = Math.min(1, Math.max(-1, samples[index]));
    const value = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    view.setInt16(wavHeaderBytes + index * pcm16BytesPerSample, value, true);
  }

  return new Blob([bytes], { type: "audio/wav" });
}

function songAudioDurationSec(song: Song, tailSec: number): number {
  const audibleEvents = flattenSongEvents(song).filter((event) => event.frequencyHz !== null && event.gateDurationSec > 0);
  if (audibleEvents.length === 0) return 0;
  return Math.max(...audibleEvents.map((event) => event.startTimeSec + event.durationSec)) + tailSec;
}

async function renderSongAudio(song: Song, sampleRate: number, durationSec: number): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("OfflineAudioContext is not available in this browser");
  }

  const frameCount = Math.max(1, Math.ceil(durationSec * sampleRate));
  const context = new OfflineAudioContext(1, frameCount, sampleRate);
  const synth = new Synth(context);

  for (const event of flattenSongEvents(song)) {
    synth.schedule(event, event.startTimeSec, song.patches);
  }

  const rendered = await context.startRendering();
  synth.disconnect();
  return rendered;
}

function flattenSongEvents(song: Song): NoteEvent[] {
  return song.tracks
    .flatMap((track) => track.events)
    .sort((a, b) => a.startTimeSec - b.startTimeSec || a.trackIndex - b.trackIndex);
}

function mixToMono(buffer: AudioBufferLike): Float32Array {
  const mixed = new Float32Array(buffer.length);
  const channelCount = Math.max(buffer.numberOfChannels, 1);

  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < buffer.length; index += 1) {
      mixed[index] += data[index] / channelCount;
    }
  }

  return mixed;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
