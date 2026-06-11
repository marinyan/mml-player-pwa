import type { NoteEvent, TempoEvent } from "../mml/types";

const ticksPerQuarter = 480;
const defaultSpreadThreshold = 4;
const defaultMaxSpreadTicks = 4;

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

export function calculateTimingOffsets(
  events: NoteEvent[],
  tempoEvents: TempoEvent[],
  spreadThreshold = defaultSpreadThreshold,
  maxSpreadTicks = defaultMaxSpreadTicks
): WeakMap<NoteEvent, number> {
  const offsets = new WeakMap<NoteEvent, number>();
  const groups = new Map<number, NoteEvent[]>();

  for (const event of events) {
    if (event.frequencyHz === null || event.gateDurationSec <= 0) continue;
    const key = Math.round(event.startTimeSec * 1_000_000);
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < spreadThreshold) continue;

    const ordered = [...group].sort(
      (a, b) => a.trackIndex - b.trackIndex || (a.frequencyHz ?? 0) - (b.frequencyHz ?? 0)
    );
    const secondsPerTick = 60 / (tempoAt(ordered[0].startTimeSec, tempoEvents) * ticksPerQuarter);
    const maxOffsetSec = maxSpreadTicks * secondsPerTick;
    const earliestOffsetSec = -Math.min(maxOffsetSec, ordered[0].startTimeSec);
    const latestOffsetSec = earliestOffsetSec + maxOffsetSec * 2;

    ordered.forEach((event, index) => {
      const ratio = ordered.length === 1 ? 0.5 : index / (ordered.length - 1);
      offsets.set(event, earliestOffsetSec + (latestOffsetSec - earliestOffsetSec) * ratio);
    });
  }

  return offsets;
}

function tempoAt(timeSec: number, tempoEvents: TempoEvent[]): number {
  let tempo = 120;
  for (const event of tempoEvents) {
    if (event.timeSec > timeSec) break;
    tempo = event.tempo;
  }
  return tempo;
}
