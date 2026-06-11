import type { TempoEvent } from "../mml/types";

const ticksPerQuarter = 480;

interface TempoSegment {
  startSec: number;
  startTick: number;
  tempo: number;
}

export interface TempoMap {
  events: TempoEvent[];
  secondsToTicks(seconds: number): number;
}

export function createTempoMap(sourceEvents: TempoEvent[]): TempoMap {
  const events = normalizeTempoEvents(sourceEvents);
  const segments: TempoSegment[] = [];
  let startTick = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const previous = segments.at(-1);
    if (previous) {
      startTick += (event.timeSec - previous.startSec) * ticksPerQuarter * previous.tempo / 60;
    }
    segments.push({ startSec: event.timeSec, startTick, tempo: event.tempo });
  }

  return {
    events,
    secondsToTicks(seconds: number): number {
      const targetSec = Math.max(seconds, 0);
      let low = 0;
      let high = segments.length - 1;

      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (segments[middle].startSec <= targetSec) low = middle;
        else high = middle - 1;
      }

      const segment = segments[low];
      const ticks = segment.startTick + (targetSec - segment.startSec) * ticksPerQuarter * segment.tempo / 60;
      return Math.round(ticks);
    }
  };
}

function normalizeTempoEvents(events: TempoEvent[]): TempoEvent[] {
  const byTime = new Map<number, TempoEvent>();
  byTime.set(0, { type: "setTempo", timeSec: 0, tempo: 120 });
  for (const event of events) {
    byTime.set(event.timeSec, event);
  }
  return [...byTime.values()].sort((a, b) => a.timeSec - b.timeSec);
}
