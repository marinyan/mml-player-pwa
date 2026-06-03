import { describe, expect, it } from "vitest";
import { compileMml, noteFrequency } from "./compiler";
import { MmlError } from "./types";

describe("compileMml", () => {
  it("compiles tempo, octave, length and notes", () => {
    const result = compileMml("T120 O4 L4 C D E");
    expect(result.tempo).toBe(120);
    expect(result.events).toHaveLength(3);
    expect(result.events.map((event) => event.startTimeSec)).toEqual([0, 0.5, 1]);
    expect(result.events.map((event) => event.durationSec)).toEqual([0.5, 0.5, 0.5]);
  });

  it("compiles dotted notes", () => {
    const result = compileMml("T120 L4 C.");
    expect(result.events[0].durationSec).toBeCloseTo(0.75);
    expect(result.events[0].gateDurationSec).toBeCloseTo(0.75);
  });

  it("overrides note length", () => {
    const result = compileMml("T120 L4 C8 D16");
    expect(result.events.map((event) => event.durationSec)).toEqual([0.25, 0.125]);
  });

  it("compiles accidentals", () => {
    const result = compileMml("O4 C# D-");
    expect(result.events[0].frequencyHz).toBeCloseTo(noteFrequency("C", 4, 1));
    expect(result.events[1].frequencyHz).toBeCloseTo(noteFrequency("D", 4, -1));
  });

  it("compiles octave changes", () => {
    const result = compileMml("O4 C > C < C");
    expect(result.events[0].frequencyHz).toBeCloseTo(noteFrequency("C", 4, 0));
    expect(result.events[1].frequencyHz).toBeCloseTo(noteFrequency("C", 5, 0));
    expect(result.events[2].frequencyHz).toBeCloseTo(noteFrequency("C", 4, 0));
  });

  it("compiles rests", () => {
    const result = compileMml("T120 C R C");
    expect(result.events).toHaveLength(3);
    expect(result.events[1].frequencyHz).toBeNull();
    expect(result.events[2].startTimeSec).toBe(1);
  });

  it("compiles multiple tracks", () => {
    const result = compileMml("C,D");
    expect(result.trackCount).toBe(2);
    expect(result.events.map((event) => event.trackIndex)).toEqual([0, 1]);
    expect(result.events.map((event) => event.startTimeSec)).toEqual([0, 0]);
  });

  it("compiles timbre changes", () => {
    const result = compileMml("@1 C @4 D @5 E @6 F");
    expect(result.events.map((event) => event.timbre)).toEqual([1, 4, 5, 6]);
  });

  it("ignores line comments", () => {
    const result = compileMml("T120 L4 C // ignored D E\nD");
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.startTimeSec)).toEqual([0, 0.5]);
  });

  it("ties matching notes with &", () => {
    const result = compileMml("T120 L4 C&C");
    expect(result.events).toHaveLength(1);
    expect(result.events[0].durationSec).toBeCloseTo(1);
    expect(result.events[0].gateDurationSec).toBeCloseTo(1);
    expect(result.events[0].slurred).toBe(false);
    expect(result.events[0].connectedToNext).toBe(false);
  });

  it("slurs different notes with &", () => {
    const result = compileMml("T120 L4 C&D");
    expect(result.events).toHaveLength(2);
    expect(result.events[0].gateDurationSec).toBeCloseTo(0.5);
    expect(result.events[0].connectedToNext).toBe(true);
    expect(result.events[1].startTimeSec).toBeCloseTo(0.5);
    expect(result.events[1].slurred).toBe(true);
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
