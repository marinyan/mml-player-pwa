import { describe, expect, it } from "vitest";
import { compileMml } from "../mml/compiler";
import { calculateSongVoiceGain } from "./mix";

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
