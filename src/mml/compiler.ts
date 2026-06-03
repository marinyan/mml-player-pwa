import { parseMml, type MmlCommand } from "./parser";
import type { CompileResult, NoteEvent, TrackState } from "./types";

const noteSemitones: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

const initialState: TrackState = {
  tempo: 120,
  octave: 4,
  defaultLength: 4,
  volume: 12,
  gate: 8,
  timbre: 0,
  cursorSec: 0
};

export function compileMml(source: string): CompileResult {
  const ast = parseMml(source);
  const events: NoteEvent[] = [];
  let lastTempo = initialState.tempo;

  ast.tracks.forEach((track, trackIndex) => {
    const state: TrackState = { ...initialState };
    for (const command of track.commands) {
      const event = applyCommand(command, state, trackIndex);
      if (command.kind === "tempo") lastTempo = command.value;
      if (event) events.push(event);
    }
  });

  events.sort((a, b) => a.startTimeSec - b.startTimeSec || a.trackIndex - b.trackIndex);
  return {
    events,
    tempo: lastTempo,
    durationSec: events.reduce((max, event) => Math.max(max, event.startTimeSec + event.durationSec), 0),
    trackCount: ast.tracks.length
  };
}

function applyCommand(command: MmlCommand, state: TrackState, trackIndex: number): NoteEvent | null {
  switch (command.kind) {
    case "tempo":
      state.tempo = command.value;
      return null;
    case "octave":
      state.octave = command.value;
      return null;
    case "defaultLength":
      state.defaultLength = command.value;
      return null;
    case "volume":
      state.volume = command.value;
      return null;
    case "gate":
      state.gate = command.value;
      return null;
    case "timbre":
      state.timbre = command.value;
      return null;
    case "octaveShift":
      state.octave += command.delta;
      return null;
    case "note":
      return createTimedEvent(state, trackIndex, command.length, command.dotted, noteFrequency(command.note, state.octave, command.accidental));
    case "rest":
      return createTimedEvent(state, trackIndex, command.length, command.dotted, null);
  }
}

function createTimedEvent(
  state: TrackState,
  trackIndex: number,
  lengthOverride: number | null,
  dotted: boolean,
  frequencyHz: number | null
): NoteEvent {
  const durationSec = noteDurationSec(lengthOverride ?? state.defaultLength, state.tempo, dotted);
  const gateDurationSec = frequencyHz === null ? 0 : durationSec * Math.min(Math.max(state.gate, 1), 8) / 8;
  const event: NoteEvent = {
    trackIndex,
    startTimeSec: state.cursorSec,
    durationSec,
    gateDurationSec,
    frequencyHz,
    volume: state.volume / 15,
    timbre: state.timbre
  };
  state.cursorSec += durationSec;
  return event;
}

export function noteDurationSec(length: number, tempo: number, dotted: boolean): number {
  const quarterNoteSec = 60 / tempo;
  const duration = quarterNoteSec * (4 / length);
  return dotted ? duration * 1.5 : duration;
}

export function noteFrequency(note: string, octave: number, accidental: number): number {
  const midiNumber = (octave + 1) * 12 + noteSemitones[note] + accidental;
  return 440 * 2 ** ((midiNumber - 69) / 12);
}
