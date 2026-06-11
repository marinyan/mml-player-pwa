import { describe, expect, it } from "vitest";
import { compileMml } from "../mml/compiler";
import { createPlaybackPlan, flattenSongEvents } from "./playbackPlan";

describe("playback plan", () => {
  it("flattens tracks in playback order without changing the song tracks", () => {
    const song = compileMml("T120 L4 C D, T120 L8 E F");
    const originalTrackEvents = song.tracks.map((track) => [...track.events]);
    const events = flattenSongEvents(song);

    expect(events.map((event) => [event.startTimeSec, event.trackIndex])).toEqual([
      [0, 0],
      [0, 1],
      [0.25, 1],
      [0.5, 0]
    ]);
    expect(song.tracks.map((track) => track.events)).toEqual(originalTrackEvents);
  });

  it("prepares shared gain and timing offsets for audio renderers", () => {
    const song = compileMml("T120 (CEGB)4");
    const plan = createPlaybackPlan(song);

    expect(plan.events).toHaveLength(4);
    expect(plan.voiceGain).toBeCloseTo(0.5);
    expect(plan.timingOffsets.get(plan.events.at(-1)!)).toBeGreaterThan(0);
  });
});
