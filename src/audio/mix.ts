import type { NoteEvent } from "../mml/types";

export function calculateSongVoiceGain(events: NoteEvent[]): number {
  const boundaries = events
    .filter((event) => event.frequencyHz !== null && event.gateDurationSec > 0)
    .flatMap((event) => [
      { timeSec: event.startTimeSec, delta: 1 },
      { timeSec: event.startTimeSec + event.gateDurationSec, delta: -1 }
    ])
    .sort((a, b) => a.timeSec - b.timeSec || a.delta - b.delta);

  let activeVoices = 0;
  let maxVoices = 0;
  for (const boundary of boundaries) {
    activeVoices += boundary.delta;
    maxVoices = Math.max(maxVoices, activeVoices);
  }

  return 1 / Math.sqrt(Math.max(maxVoices, 1));
}
