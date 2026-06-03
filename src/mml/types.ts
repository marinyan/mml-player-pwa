export interface NoteEvent {
  trackIndex: number;
  startTimeSec: number;
  durationSec: number;
  gateDurationSec: number;
  frequencyHz: number | null;
  volume: number;
  timbre: number;
  slurred: boolean;
}

export interface TrackState {
  tempo: number;
  octave: number;
  defaultLength: number;
  volume: number;
  gate: number;
  timbre: number;
  cursorSec: number;
}

export interface CompileResult {
  events: NoteEvent[];
  tempo: number;
  durationSec: number;
  trackCount: number;
}

export class MmlError extends Error {
  readonly position: number;

  constructor(position: number, message: string) {
    super(message);
    this.name = "MmlError";
    this.position = position;
  }
}
