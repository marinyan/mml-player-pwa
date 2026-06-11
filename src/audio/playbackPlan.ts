import type { NoteEvent, Song } from "../mml/types";
import { calculateSongVoiceGain, calculateTimingOffsets } from "./mix";

export interface PlaybackPlan {
  events: NoteEvent[];
  voiceGain: number;
  timingOffsets: WeakMap<NoteEvent, number>;
}

export function createPlaybackPlan(song: Song): PlaybackPlan {
  const events = flattenSongEvents(song);
  return {
    events,
    voiceGain: calculateSongVoiceGain(events),
    timingOffsets: calculateTimingOffsets(events, song.master.tempoEvents)
  };
}

export function flattenSongEvents(song: Song): NoteEvent[] {
  return song.tracks
    .flatMap((track) => track.events)
    .sort((a, b) => a.startTimeSec - b.startTimeSec || a.trackIndex - b.trackIndex);
}
