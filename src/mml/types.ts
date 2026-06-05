export interface NoteEvent {
  trackIndex: number;
  startTimeSec: number;
  durationSec: number;
  gateDurationSec: number;
  frequencyHz: number | null;
  volume: number;
  pan: number;
  outputChannelGains: OutputChannelGains;
  timbre: number;
  gmProgram: number | null;
  slurred: boolean;
  connectedToNext: boolean;
}

export type OutputChannelGains = [number, number, number, number, number, number];

export interface TempoEvent {
  type: "setTempo";
  timeSec: number;
  tempo: number;
}

export interface TimeSignatureEvent {
  type: "setTimeSignature";
  tick: number;
  numerator: number;
  denominator: number;
  measureLengthTicks: number;
}

export interface MeasureBoundary {
  tick: number;
  explicit: boolean;
  trackIndex?: number;
}

export interface Diagnostic {
  severity: "warning";
  position: number;
  message: string;
  trackIndex?: number;
}

export interface SongMaster {
  tempoEvents: TempoEvent[];
  timeSignatureEvents: TimeSignatureEvent[];
  measureBoundaries: MeasureBoundary[];
  diagnostics: Diagnostic[];
}

export interface SongTrack {
  trackIndex: number;
  events: NoteEvent[];
}

export interface Song {
  master: SongMaster;
  patches: PatchRegistry;
  tracks: SongTrack[];
  durationSec: number;
}

export interface BuiltinPatch {
  id: number;
  kind: "builtin";
}

export interface FmOperator {
  ratio: number;
  detune: number;
  level: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface FmPatch {
  id: number;
  name: string;
  algorithm: number;
  feedback: number;
  operators: FmOperator[];
}

export interface GmPatch {
  id: number;
  name: string;
  kind: "gm";
  builtinTimbre: number;
  fmPatch?: FmPatch;
}

export interface PatchRegistry {
  builtinPatches: Map<number, BuiltinPatch>;
  userFmPatches: Map<number, FmPatch>;
  gmPatches: Map<number, GmPatch>;
}

export interface TrackState {
  tempo: number;
  octave: number;
  defaultLength: number;
  volume: number;
  pan: number;
  outputChannelGains: OutputChannelGains;
  gate: number;
  timbre: number;
  gmProgram: number | null;
  cursorSec: number;
  cursorTicks: number;
}

export class MmlError extends Error {
  readonly position: number;

  constructor(position: number, message: string) {
    super(message);
    this.name = "MmlError";
    this.position = position;
  }
}
