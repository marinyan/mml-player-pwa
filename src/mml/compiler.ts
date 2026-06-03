import { extractFmPatches } from "./fmPatches";
import { parseMml, type MmlCommand } from "./parser";
import { expandRepeats } from "./repeatExpander";
import {
  MmlError,
  type Diagnostic,
  type MeasureBoundary,
  type NoteEvent,
  type Song,
  type TempoEvent,
  type TimeSignatureEvent,
  type TrackState
} from "./types";

const ticksPerQuarter = 480;
const defaultTimeSignature = { numerator: 4, denominator: 4 };

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
  cursorSec: 0,
  cursorTicks: 0
};

interface CompilerState extends TrackState {
  connectPending: boolean;
  lastNoteEvent: NoteEvent | null;
  measureStartTick: number;
  measureLengthTicks: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
}

export function compileMml(source: string): Song {
  const extracted = extractFmPatches(source);
  const ast = parseMml(expandRepeats(extracted.mml));
  const tracks = ast.tracks.map((_, trackIndex) => ({ trackIndex, events: [] as NoteEvent[] }));
  const tempoEvents: TempoEvent[] = [];
  const timeSignatureEvents: TimeSignatureEvent[] = [
    createTimeSignatureEvent(0, defaultTimeSignature.numerator, defaultTimeSignature.denominator)
  ];
  const measureBoundaries: MeasureBoundary[] = [];
  const diagnostics: Diagnostic[] = [];
  const explicitBoundaryTicks = new Map<number, number[]>();

  ast.tracks.forEach((track, trackIndex) => {
    const state: CompilerState = {
      ...initialState,
      connectPending: false,
      lastNoteEvent: null,
      measureStartTick: 0,
      measureLengthTicks: measureLengthTicks(defaultTimeSignature.numerator, defaultTimeSignature.denominator),
      timeSignature: { ...defaultTimeSignature }
    };
    for (const command of track.commands) {
      const event = applyCommand(command, state, trackIndex, {
        diagnostics,
        measureBoundaries,
        timeSignatureEvents,
        explicitBoundaryTicks,
        userFmPatches: extracted.patches.userFmPatches
      });
      if (command.kind === "tempo") {
        tempoEvents.push({ type: "setTempo", timeSec: state.cursorSec, tempo: command.value });
      }
      if (event) tracks[trackIndex].events.push(event);
    }
    if (state.connectPending) {
      throw new MmlError(track.commands.at(-1)?.position ?? 0, "Tie/slur must be followed by a note");
    }
  });

  addMeasureAlignmentDiagnostics(explicitBoundaryTicks, diagnostics);

  for (const songTrack of tracks) {
    songTrack.events.sort((a, b) => a.startTimeSec - b.startTimeSec);
  }

  return {
    master: {
      tempoEvents: tempoEvents.sort((a, b) => a.timeSec - b.timeSec),
      timeSignatureEvents: dedupeTimeSignatureEvents(timeSignatureEvents),
      measureBoundaries: measureBoundaries.sort((a, b) => a.tick - b.tick || Number(b.explicit) - Number(a.explicit)),
      diagnostics
    },
    patches: extracted.patches,
    tracks,
    durationSec: tracks.reduce(
      (max, track) =>
        Math.max(max, ...track.events.map((event) => event.startTimeSec + event.durationSec), 0),
      0
    )
  };
}

interface CompilerOutputs {
  diagnostics: Diagnostic[];
  measureBoundaries: MeasureBoundary[];
  timeSignatureEvents: TimeSignatureEvent[];
  explicitBoundaryTicks: Map<number, number[]>;
  userFmPatches: Map<number, unknown>;
}

function applyCommand(
  command: MmlCommand,
  state: CompilerState,
  trackIndex: number,
  outputs: CompilerOutputs
): NoteEvent | null {
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
      if (command.value >= 16 && !outputs.userFmPatches.has(command.value)) {
        throw new MmlError(command.position, `FM timbre @${command.value} is not defined`);
      }
      state.timbre = command.value;
      return null;
    case "connect":
      if (!state.lastNoteEvent || state.connectPending) {
        throw new MmlError(command.position, "Tie/slur must follow a note");
      }
      state.connectPending = true;
      return null;
    case "timeSignature":
      applyTimeSignature(command, state, trackIndex, outputs);
      return null;
    case "measureBoundary":
      applyMeasureBoundary(command.position, state, trackIndex, outputs);
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
  const durationTicks = noteDurationTicks(lengthOverride ?? state.defaultLength, dotted);
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
  state.cursorTicks += durationTicks;
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

function applyTimeSignature(
  command: Extract<MmlCommand, { kind: "timeSignature" }>,
  state: CompilerState,
  trackIndex: number,
  outputs: CompilerOutputs
): void {
  if (state.cursorTicks !== state.measureStartTick) {
    outputs.diagnostics.push({
      severity: "warning",
      position: command.position,
      trackIndex,
      message: "小節途中の拍子変更: 現在位置を新しい小節境界として扱いました"
    });
    outputs.measureBoundaries.push({ tick: state.cursorTicks, explicit: false, trackIndex });
    state.measureStartTick = state.cursorTicks;
  }

  state.timeSignature = {
    numerator: command.numerator,
    denominator: command.denominator
  };
  state.measureLengthTicks = measureLengthTicks(command.numerator, command.denominator);
  outputs.timeSignatureEvents.push(createTimeSignatureEvent(state.cursorTicks, command.numerator, command.denominator));
}

function applyMeasureBoundary(
  position: number,
  state: CompilerState,
  trackIndex: number,
  outputs: CompilerOutputs
): void {
  const explicitTicks = outputs.explicitBoundaryTicks.get(trackIndex) ?? [];
  explicitTicks.push(state.cursorTicks);
  outputs.explicitBoundaryTicks.set(trackIndex, explicitTicks);

  let elapsedTicks = state.cursorTicks - state.measureStartTick;
  let insertedVirtualBoundary = false;

  while (elapsedTicks > state.measureLengthTicks) {
    const boundaryTick = state.measureStartTick + state.measureLengthTicks;
    outputs.measureBoundaries.push({ tick: boundaryTick, explicit: false, trackIndex });
    outputs.diagnostics.push({
      severity: "warning",
      position,
      trackIndex,
      message: `小節長超過: ${timeSignatureLabel(state)} の小節長を超えたため、仮想小節線を挿入しました`
    });
    state.measureStartTick = boundaryTick;
    elapsedTicks = state.cursorTicks - state.measureStartTick;
    insertedVirtualBoundary = true;
  }

  if (insertedVirtualBoundary) {
    return;
  }

  if (elapsedTicks < state.measureLengthTicks) {
    const missingTicks = state.measureLengthTicks - elapsedTicks;
    advanceCursorByTicks(state, missingTicks);
    outputs.diagnostics.push({
      severity: "warning",
      position,
      trackIndex,
      message: `小節長不足: ${timeSignatureLabel(state)} の小節に不足があるため、${missingTicks} ticks分の休符を補完しました`
    });
  }

  outputs.measureBoundaries.push({ tick: state.cursorTicks, explicit: true, trackIndex });
  state.measureStartTick = state.cursorTicks;
}

function advanceCursorByTicks(state: CompilerState, ticks: number): void {
  state.cursorTicks += ticks;
  state.cursorSec += (ticks / ticksPerQuarter) * (60 / state.tempo);
}

function measureLengthTicks(numerator: number, denominator: number): number {
  return numerator * (4 / denominator) * ticksPerQuarter;
}

function createTimeSignatureEvent(tick: number, numerator: number, denominator: number): TimeSignatureEvent {
  return {
    type: "setTimeSignature",
    tick,
    numerator,
    denominator,
    measureLengthTicks: measureLengthTicks(numerator, denominator)
  };
}

function dedupeTimeSignatureEvents(events: TimeSignatureEvent[]): TimeSignatureEvent[] {
  const byTick = new Map<number, TimeSignatureEvent>();
  for (const event of events) {
    byTick.set(event.tick, event);
  }
  return [...byTick.values()].sort((a, b) => a.tick - b.tick);
}

function addMeasureAlignmentDiagnostics(explicitBoundaryTicks: Map<number, number[]>, diagnostics: Diagnostic[]): void {
  if (explicitBoundaryTicks.size < 2) return;

  const tracks = [...explicitBoundaryTicks.entries()].sort(([a], [b]) => a - b);
  const maxBoundaryCount = Math.max(...tracks.map(([, ticks]) => ticks.length));

  for (let index = 0; index < maxBoundaryCount; index += 1) {
    const ticksAtIndex = tracks.map(([, ticks]) => ticks[index]).filter((tick): tick is number => tick !== undefined);
    if (new Set(ticksAtIndex).size > 1) {
      diagnostics.push({
        severity: "warning",
        position: 0,
        message: "複数トラックの小節線位置が一致していません"
      });
    }
  }
}

function noteDurationTicks(length: number, dotted: boolean): number {
  const duration = ticksPerQuarter * (4 / length);
  return dotted ? duration * 1.5 : duration;
}

function timeSignatureLabel(state: CompilerState): string {
  return `${state.timeSignature.numerator}/${state.timeSignature.denominator}`;
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
