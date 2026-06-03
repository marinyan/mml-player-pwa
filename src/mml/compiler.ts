import { parseMml, type MmlCommand } from "./parser";
import { MmlError, type NoteEvent, type Song, type TempoEvent, type TrackState } from "./types";

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

interface CompilerState extends TrackState {
  connectPending: boolean;
  lastNoteEvent: NoteEvent | null;
}

export function compileMml(source: string): Song {
  const ast = parseMml(source);
  const tracks = ast.tracks.map((_, trackIndex) => ({ trackIndex, events: [] as NoteEvent[] }));
  const tempoEvents: TempoEvent[] = [];

  ast.tracks.forEach((track, trackIndex) => {
    const state: CompilerState = { ...initialState, connectPending: false, lastNoteEvent: null };
    for (const command of track.commands) {
      const event = applyCommand(command, state, trackIndex);
      if (command.kind === "tempo") {
        tempoEvents.push({ type: "setTempo", timeSec: state.cursorSec, tempo: command.value });
      }
      if (event) tracks[trackIndex].events.push(event);
    }
    if (state.connectPending) {
      throw new MmlError(track.commands.at(-1)?.position ?? 0, "Tie/slur must be followed by a note");
    }
  });

  for (const songTrack of tracks) {
    songTrack.events.sort((a, b) => a.startTimeSec - b.startTimeSec);
  }

  return {
    master: {
      tempoEvents: tempoEvents.sort((a, b) => a.timeSec - b.timeSec)
    },
    tracks,
    durationSec: tracks.reduce(
      (max, track) =>
        Math.max(max, ...track.events.map((event) => event.startTimeSec + event.durationSec), 0),
      0
    )
  };
}

function applyCommand(command: MmlCommand, state: CompilerState, trackIndex: number): NoteEvent | null {
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
    case "connect":
      if (!state.lastNoteEvent || state.connectPending) {
        throw new MmlError(command.position, "Tie/slur must follow a note");
      }
      state.connectPending = true;
      return null;
    case "octaveShift":
      state.octave += command.delta;
      return null;
    case "note":
      return createNoteEvent(
        state,
        trackIndex,
        command.length,
        command.dotted,
        noteFrequency(command.note, state.octave, command.accidental)
      );
    case "rest":
      if (state.connectPending) {
        throw new MmlError(command.position, "Tie/slur cannot connect to a rest");
      }
      state.lastNoteEvent = null;
      return createTimedEvent(state, trackIndex, command.length, command.dotted, null);
  }
}

function createNoteEvent(
  state: CompilerState,
  trackIndex: number,
  lengthOverride: number | null,
  dotted: boolean,
  frequencyHz: number
): NoteEvent | null {
  const event = createTimedEvent(state, trackIndex, lengthOverride, dotted, frequencyHz);

  if (!state.connectPending) {
    state.lastNoteEvent = event;
    return event;
  }

  const previous = state.lastNoteEvent;
  state.connectPending = false;
  if (!previous) {
    throw new MmlError(0, "Tie/slur must follow a note");
  }

  if (canTie(previous, event)) {
    previous.durationSec += event.durationSec;
    previous.gateDurationSec = previous.durationSec;
    return null;
  }

  previous.gateDurationSec = previous.durationSec;
  previous.connectedToNext = true;
  event.gateDurationSec = event.durationSec;
  event.slurred = true;
  state.lastNoteEvent = event;
  return event;
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
    timbre: state.timbre,
    slurred: false,
    connectedToNext: false
  };
  state.cursorSec += durationSec;
  return event;
}

function canTie(previous: NoteEvent, next: NoteEvent): boolean {
  return (
    previous.trackIndex === next.trackIndex &&
    previous.frequencyHz === next.frequencyHz &&
    previous.volume === next.volume &&
    previous.timbre === next.timbre
  );
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
