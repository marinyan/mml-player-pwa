import { describe, expect, it } from "vitest";
import { compileMml, noteFrequency } from "./compiler";
import { MmlError, type NoteEvent, type Song } from "./types";

describe("compileMml", () => {
  it("compiles tempo, octave, length and notes", () => {
    const result = compileMml("T120 O4 L4 C D E");
    expect(result.master.tempoEvents).toEqual([{ type: "setTempo", timeSec: 0, tempo: 120 }]);
    expect(events(result)).toHaveLength(3);
    expect(events(result).map((event) => event.startTimeSec)).toEqual([0, 0.5, 1]);
    expect(events(result).map((event) => event.durationSec)).toEqual([0.5, 0.5, 0.5]);
  });

  it("stores tempo changes in song master", () => {
    const result = compileMml("T120 L4 C T60 D");
    expect(result.master.tempoEvents).toEqual([
      { type: "setTempo", timeSec: 0, tempo: 120 },
      { type: "setTempo", timeSec: 0.5, tempo: 60 }
    ]);
    expect(events(result).map((event) => event.durationSec)).toEqual([0.5, 1]);
  });

  it("compiles dotted notes", () => {
    const result = compileMml("T120 L4 C.");
    expect(events(result)[0].durationSec).toBeCloseTo(0.75);
    expect(events(result)[0].gateDurationSec).toBeCloseTo(0.75);
  });

  it("overrides note length", () => {
    const result = compileMml("T120 L4 C8 D16");
    expect(events(result).map((event) => event.durationSec)).toEqual([0.25, 0.125]);
  });

  it("compiles accidentals", () => {
    const result = compileMml("O4 C# D-");
    expect(events(result)[0].frequencyHz).toBeCloseTo(noteFrequency("C", 4, 1));
    expect(events(result)[1].frequencyHz).toBeCloseTo(noteFrequency("D", 4, -1));
  });

  it("compiles octave changes", () => {
    const result = compileMml("O4 C > C < C");
    expect(events(result)[0].frequencyHz).toBeCloseTo(noteFrequency("C", 4, 0));
    expect(events(result)[1].frequencyHz).toBeCloseTo(noteFrequency("C", 5, 0));
    expect(events(result)[2].frequencyHz).toBeCloseTo(noteFrequency("C", 4, 0));
  });

  it("compiles rests", () => {
    const result = compileMml("T120 C R C");
    expect(events(result)).toHaveLength(3);
    expect(events(result)[1].frequencyHz).toBeNull();
    expect(events(result)[2].startTimeSec).toBe(1);
  });

  it("compiles multiple tracks", () => {
    const result = compileMml("C,D");
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks.map((track) => track.events.length)).toEqual([1, 1]);
    expect(events(result).map((event) => event.trackIndex)).toEqual([0, 1]);
    expect(events(result).map((event) => event.startTimeSec)).toEqual([0, 0]);
  });

  it("compiles timbre changes", () => {
    const result = compileMml("@1 C @4 D @5 E @6 F");
    expect(events(result).map((event) => event.timbre)).toEqual([1, 4, 5, 6]);
  });

  it("ignores line comments", () => {
    const result = compileMml("T120 L4 C // ignored D E\nD");
    expect(events(result)).toHaveLength(2);
    expect(events(result).map((event) => event.startTimeSec)).toEqual([0, 0.5]);
  });

  it("ties matching notes with &", () => {
    const result = compileMml("T120 L4 C&C");
    expect(events(result)).toHaveLength(1);
    expect(events(result)[0].durationSec).toBeCloseTo(1);
    expect(events(result)[0].gateDurationSec).toBeCloseTo(1);
    expect(events(result)[0].slurred).toBe(false);
    expect(events(result)[0].connectedToNext).toBe(false);
  });

  it("slurs different notes with &", () => {
    const result = compileMml("T120 L4 C&D");
    expect(events(result)).toHaveLength(2);
    expect(events(result)[0].gateDurationSec).toBeCloseTo(0.5);
    expect(events(result)[0].connectedToNext).toBe(true);
    expect(events(result)[1].startTimeSec).toBeCloseTo(0.5);
    expect(events(result)[1].slurred).toBe(true);
  });

  it("throws when & is not between notes", () => {
    expect(() => compileMml("&C")).toThrow(MmlError);
    expect(() => compileMml("C&")).toThrow(MmlError);
    expect(() => compileMml("C&R")).toThrow(MmlError);
  });

  it("throws on invalid characters", () => {
    expect(() => compileMml("C X")).toThrow(MmlError);
    expect(() => compileMml("C / D")).toThrow(MmlError);
  });
});

function events(song: Song): NoteEvent[] {
  return song.tracks
    .flatMap((track) => track.events)
    .sort((a, b) => a.startTimeSec - b.startTimeSec || a.trackIndex - b.trackIndex);
}
