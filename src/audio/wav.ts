import type { Song } from "../mml/types";
import { createPlaybackPlan, flattenSongEvents } from "./playbackPlan";
import { Synth } from "./synth";

const defaultSampleRate = 44100;
const defaultTailSec = 1;
const defaultChannelCount = 2;
const maxOutputChannels = 6;
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
  channelCount?: number;
  renderAudio?: (song: Song, options: { sampleRate: number; durationSec: number; channelCount: number }) => Promise<AudioBufferLike>;
}

export async function renderSongToWav(song: Song, options: RenderSongToWavOptions = {}): Promise<Blob> {
  const sampleRate = options.sampleRate ?? defaultSampleRate;
  const channelCount = normalizeChannelCount(options.channelCount ?? defaultChannelCount);
  const durationSec = songAudioDurationSec(song, options.tailSec ?? defaultTailSec);

  if (durationSec <= 0) {
    throw new Error("WAV export requires at least one audible note");
  }

  const rendered = options.renderAudio
    ? await options.renderAudio(song, { sampleRate, durationSec, channelCount })
    : await renderSongAudio(song, sampleRate, durationSec, channelCount);

  return encodeAudioBufferToWav(rendered);
}

export function estimateWavBytes(
  song: Song,
  sampleRate = defaultSampleRate,
  tailSec = defaultTailSec,
  channelCount = defaultChannelCount
): number {
  const durationSec = songAudioDurationSec(song, tailSec);
  if (durationSec <= 0) return 0;
  return wavHeaderBytes + Math.ceil(durationSec * sampleRate) * normalizeChannelCount(channelCount) * pcm16BytesPerSample;
}

export function encodeAudioBufferToWav(buffer: AudioBufferLike): Blob {
  return encodePcm16Wav(readChannels(buffer), buffer.sampleRate);
}

export function encodePcm16Wav(samples: Float32Array | Float32Array[], sampleRate: number): Blob {
  const channels = Array.isArray(samples) ? samples : [samples];
  const channelCount = channels.length;
  const frameCount = channels[0]?.length ?? 0;
  if (channelCount < 1 || channelCount > maxOutputChannels) {
    throw new Error("WAV channel count must be 1-6");
  }
  if (!channels.every((channel) => channel.length === frameCount)) {
    throw new Error("All WAV channels must have the same sample count");
  }

  const dataBytes = frameCount * channelCount * pcm16BytesPerSample;
  const bytes = new ArrayBuffer(wavHeaderBytes + dataBytes);
  const view = new DataView(bytes);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * pcm16BytesPerSample, true);
  view.setUint16(32, channelCount * pcm16BytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const clipped = Math.min(1, Math.max(-1, channels[channel][frame]));
      const value = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
      const offset = wavHeaderBytes + (frame * channelCount + channel) * pcm16BytesPerSample;
      view.setInt16(offset, value, true);
    }
  }

  return new Blob([bytes], { type: "audio/wav" });
}

function songAudioDurationSec(song: Song, tailSec: number): number {
  const audibleEvents = flattenSongEvents(song).filter((event) => event.frequencyHz !== null && event.gateDurationSec > 0);
  if (audibleEvents.length === 0) return 0;
  return Math.max(...audibleEvents.map((event) => event.startTimeSec + event.durationSec)) + tailSec;
}

async function renderSongAudio(song: Song, sampleRate: number, durationSec: number, channelCount: number): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new Error("OfflineAudioContext is not available in this browser");
  }

  const frameCount = Math.max(1, Math.ceil(durationSec * sampleRate));
  const context = new OfflineAudioContext(channelCount, frameCount, sampleRate);
  const synth = new Synth(context, { outputChannels: channelCount });
  const { events, voiceGain, timingOffsets } = createPlaybackPlan(song);

  for (const event of events) {
    synth.schedule(event, event.startTimeSec + (timingOffsets.get(event) ?? 0), song.patches, { voiceGain });
  }

  const rendered = await context.startRendering();
  synth.disconnect();
  return rendered;
}

function readChannels(buffer: AudioBufferLike): Float32Array[] {
  const channelCount = normalizeChannelCount(buffer.numberOfChannels);
  return Array.from({ length: channelCount }, (_, channel) => buffer.getChannelData(channel));
}

function normalizeChannelCount(channelCount: number): number {
  return Math.min(Math.max(Math.floor(channelCount), 1), maxOutputChannels);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
