import { describe, expect, it } from "vitest";
import { compileMml } from "../mml/compiler";
import { calculateSongVoiceGain, calculateTimingOffsets } from "./mix";

describe("calculateSongVoiceGain", () => {
  it("uses the maximum active polyphony for one stable song-wide gain", () => {
    const song = compileMml("T120 L1 C, T120 L2 E G");
    const events = song.tracks.flatMap((track) => track.events);

    expect(calculateSongVoiceGain(events)).toBeCloseTo(1 / Math.sqrt(2));
  });

  it("does not reduce a monophonic song just because notes share boundaries", () => {
    const song = compileMml("T120 L4 C D E F");
    const events = song.tracks.flatMap((track) => track.events);

    expect(calculateSongVoiceGain(events)).toBe(1);
  });
});

describe("calculateTimingOffsets", () => {
  it("spreads groups of four or more simultaneous notes around their start time", () => {
    const song = compileMml("T120 R4 (CEGB)4");
    const events = song.tracks[0].events.filter((event) => event.frequencyHz !== null);
    const offsets = calculateTimingOffsets(events, song.master.tempoEvents);
    const secondsPerTick = 60 / (120 * 480);

    expect(events.map((event) => offsets.get(event))).toEqual([
      -4 * secondsPerTick,
      expect.closeTo((-4 / 3) * secondsPerTick),
      expect.closeTo((4 / 3) * secondsPerTick),
      4 * secondsPerTick
    ]);
  });

  it("does not spread small simultaneous groups", () => {
    const song = compileMml("T120 (CEG)4");
    const events = song.tracks[0].events;
    const offsets = calculateTimingOffsets(events, song.master.tempoEvents);

    expect(events.map((event) => offsets.get(event))).toEqual([undefined, undefined, undefined]);
  });

  it("avoids negative scheduling times at the start of a song", () => {
    const song = compileMml("T120 (CEGB)4");
    const events = song.tracks[0].events;
    const offsets = calculateTimingOffsets(events, song.master.tempoEvents);

    expect(events.map((event) => event.startTimeSec + (offsets.get(event) ?? 0)).every((time) => time >= 0)).toBe(true);
    expect(offsets.get(events[0])).toBe(0);
    expect(offsets.get(events.at(-1)!)).toBeGreaterThan(0);
  });

  it("converts spread ticks using the active tempo", () => {
    const slow = compileMml("T60 R4 (CEGB)4");
    const fast = compileMml("T120 R4 (CEGB)4");
    const slowOffsets = calculateTimingOffsets(slow.tracks[0].events, slow.master.tempoEvents);
    const fastOffsets = calculateTimingOffsets(fast.tracks[0].events, fast.master.tempoEvents);

    expect(Math.abs(slowOffsets.get(slow.tracks[0].events[1])!)).toBeCloseTo(
      Math.abs(fastOffsets.get(fast.tracks[0].events[1])!) * 2
    );
  });
});
