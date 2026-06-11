import type { NoteEvent, Song } from "../mml/types";
import { createTempoMap, type TempoMap } from "./tempoMap";

const ticksPerQuarter = 480;
const gmSystemOn = [0xf0, 0x05, 0x7e, 0x7f, 0x09, 0x01, 0xf7];
// MIDI channels are zero-based here, so channel 9 is GM Channel 10 percussion.
const melodicChannels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

interface MidiEvent {
  tick: number;
  priority: number;
  bytes: number[];
}

export function exportSongToSmf(song: Song): Blob {
  const gmTracks = song.tracks
    .map((track) => track.events.filter(isGmNote))
    .filter((events) => events.length > 0);

  if (gmTracks.length === 0) {
    throw new Error("MIDI export requires at least one @gm note");
  }
  if (gmTracks.length > melodicChannels.length) {
    throw new Error(`MIDI export supports up to ${melodicChannels.length} GM tracks`);
  }

  const tempoMap = createTempoMap(song.master.tempoEvents);
  const tracks = [
    encodeTrack(createConductorEvents(song, tempoMap)),
    ...gmTracks.map((events, index) => encodeTrack(createGmTrackEvents(events, melodicChannels[index], tempoMap)))
  ];

  const header = [
    ...ascii("MThd"),
    ...uint32(6),
    ...uint16(1),
    ...uint16(tracks.length),
    ...uint16(ticksPerQuarter)
  ];

  return new Blob([new Uint8Array([...header, ...tracks.flat()])], { type: "audio/midi" });
}

export function gmTrackCount(song: Song): number {
  return song.tracks.filter((track) => track.events.some(isGmNote)).length;
}

function isGmNote(event: NoteEvent): boolean {
  return event.frequencyHz !== null && event.gmProgram !== null;
}

function createConductorEvents(song: Song, tempoMap: TempoMap): MidiEvent[] {
  const events: MidiEvent[] = [{ tick: 0, priority: 0, bytes: gmSystemOn }];

  for (const event of tempoMap.events) {
    const microsPerQuarter = Math.round(60_000_000 / event.tempo);
    events.push({
      tick: tempoMap.secondsToTicks(event.timeSec),
      priority: 1,
      bytes: [0xff, 0x51, 0x03, (microsPerQuarter >> 16) & 0xff, (microsPerQuarter >> 8) & 0xff, microsPerQuarter & 0xff]
    });
  }

  for (const event of song.master.timeSignatureEvents) {
    events.push({
      tick: event.tick,
      priority: 2,
      bytes: [0xff, 0x58, 0x04, event.numerator, denominatorPower(event.denominator), 24, 8]
    });
  }

  return events;
}

function createGmTrackEvents(notes: NoteEvent[], channel: number, tempoMap: TempoMap): MidiEvent[] {
  const events: MidiEvent[] = [];
  let currentProgram: number | null = null;
  let currentVolume: number | null = null;
  let currentPan: number | null = null;

  for (const note of notes) {
    const startTick = tempoMap.secondsToTicks(note.startTimeSec);
    const endTick = Math.max(startTick + 1, tempoMap.secondsToTicks(note.startTimeSec + note.gateDurationSec));
    const program = clamp((note.gmProgram ?? 1) - 1, 0, 127);
    const volume = clamp(Math.round(note.volume * 127), 0, 127);
    const pan = clamp(note.pan, 0, 127);
    const midiNote = frequencyToMidiNote(note.frequencyHz ?? 440);

    if (program !== currentProgram) {
      events.push({ tick: startTick, priority: 1, bytes: [0xc0 | channel, program] });
      currentProgram = program;
    }
    if (volume !== currentVolume) {
      events.push({ tick: startTick, priority: 2, bytes: [0xb0 | channel, 7, volume] });
      currentVolume = volume;
    }
    if (pan !== currentPan) {
      events.push({ tick: startTick, priority: 2, bytes: [0xb0 | channel, 10, pan] });
      currentPan = pan;
    }

    events.push({ tick: startTick, priority: 3, bytes: [0x90 | channel, midiNote, volume] });
    events.push({ tick: endTick, priority: 0, bytes: [0x80 | channel, midiNote, 0] });
  }

  return events;
}

function encodeTrack(events: MidiEvent[]): number[] {
  const body: number[] = [];
  let previousTick = 0;

  for (const event of events.sort((a, b) => a.tick - b.tick || a.priority - b.priority)) {
    body.push(...variableLength(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);

  return [...ascii("MTrk"), ...uint32(body.length), ...body];
}

function frequencyToMidiNote(frequencyHz: number): number {
  return clamp(Math.round(69 + 12 * Math.log2(frequencyHz / 440)), 0, 127);
}

function denominatorPower(denominator: number): number {
  return Math.round(Math.log2(denominator));
}

function variableLength(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];

  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }

  return bytes;
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function uint16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function uint32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
