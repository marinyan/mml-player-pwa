export interface NoteEvent {
  trackIndex: number;
  startTimeSec: number;
  durationSec: number;
  gateDurationSec: number;
  frequencyHz: number | null;
  volume: number;
  timbre: number;
  slurred: boolean;
  connectedToNext: boolean;
}

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
  tracks: SongTrack[];
  durationSec: number;
}

export interface TrackState {
  tempo: number;
  octave: number;
  defaultLength: number;
  volume: number;
  gate: number;
  timbre: number;
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
