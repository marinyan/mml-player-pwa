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

export interface SongMaster {
  tempoEvents: TempoEvent[];
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
}

export class MmlError extends Error {
  readonly position: number;

  constructor(position: number, message: string) {
    super(message);
    this.name = "MmlError";
    this.position = position;
  }
}
