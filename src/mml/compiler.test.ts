import { describe, expect, it } from "vitest";
import { compileMml, noteFrequency } from "./compiler";
import { extractFmPatches } from "./fmPatches";
import { MmlError, type NoteEvent, type Song } from "./types";

const bellPatch = `%fm @16 name="Bell"
algorithm=0
feedback=2
op1 ratio=1.00 detune=0 level=1.00 attack=0.01 decay=0.30 sustain=0.40 release=0.20
op2 ratio=2.00 detune=0 level=0.60 attack=0.01 decay=0.20 sustain=0.00 release=0.10
%end`;

const fourOpPatch = `%fm @17 name="FourOpBell"
algorithm=0
feedback=3
op1 ratio=1.00 detune=0 level=0.90 attack=0.01 decay=0.40 sustain=0.30 release=0.20
op2 ratio=2.00 detune=0 level=0.50 attack=0.01 decay=0.30 sustain=0.20 release=0.15
op3 ratio=3.00 detune=0 level=0.35 attack=0.01 decay=0.20 sustain=0.10 release=0.12
op4 ratio=4.00 detune=0 level=0.25 attack=0.01 decay=0.15 sustain=0.00 release=0.10
%end`;

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

  it("compiles pan changes into 6-channel output gains", () => {
    const result = compileMml("P-1.0 C P0 D P+1.0 E");
    const outputGains = events(result).map((event) => event.outputChannelGains);

    expect(events(result).map((event) => event.pan)).toEqual([0, 64, 127]);
    expect(outputGains[0]).toEqual([1, 0, 0, 0, 0, 0]);
    expect(outputGains[1][0]).toBeCloseTo(Math.SQRT1_2, 2);
    expect(outputGains[1][1]).toBeCloseTo(Math.SQRT1_2, 2);
    expect(outputGains[1].slice(2)).toEqual([0, 0, 0, 0]);
    expect(outputGains[2][0]).toBeCloseTo(0);
    expect(outputGains[2][1]).toBeCloseTo(1);
  });

  it("rejects pan outside -1.0 to +1.0", () => {
    expect(() => compileMml("P+1.1 C")).toThrow(MmlError);
    expect(() => compileMml("P-1.1 C")).toThrow(MmlError);
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

  it("does not tie matching notes when pan changes", () => {
    const result = compileMml("T120 L4 P-1.0 C&P+1.0 C");
    expect(events(result)).toHaveLength(2);
    expect(events(result).map((event) => event.pan)).toEqual([0, 127]);
    expect(events(result)[0].connectedToNext).toBe(true);
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

  it("extracts FM patch blocks", () => {
    const extracted = extractFmPatches(`${bellPatch}\nT120 @16 C`);
    expect(extracted.patches.userFmPatches.get(16)?.name).toBe("Bell");
  });

  it("removes FM patch blocks from performance MML", () => {
    const extracted = extractFmPatches(`${bellPatch}\nT120 @16 C`);
    expect(extracted.mml).not.toContain("%fm");
    expect(extracted.mml).not.toContain("algorithm=");
    expect(extracted.mml).toContain("T120 @16 C");
  });

  it("registers FM patches in the song registry", () => {
    const result = compileMml(`${bellPatch}\nT120 @16 C`);
    const patch = result.patches.userFmPatches.get(16);
    expect(patch?.id).toBe(16);
    expect(patch?.operators).toHaveLength(2);
  });

  it("registers 4OP FM patches in the song registry", () => {
    const result = compileMml(`${fourOpPatch}\nT120 @17 C`);
    const patch = result.patches.userFmPatches.get(17);
    expect(patch?.id).toBe(17);
    expect(patch?.operators).toHaveLength(4);
    expect(events(result).map((event) => event.timbre)).toEqual([17]);
  });

  it("references defined FM patches from performance MML", () => {
    const result = compileMml(`${bellPatch}\n@16 C D E`);
    expect(events(result).map((event) => event.timbre)).toEqual([16, 16, 16]);
  });

  it("keeps builtin timbre references working", () => {
    const result = compileMml("@0 C @4 D @15 E");
    expect(events(result).map((event) => event.timbre)).toEqual([0, 4, 15]);
    expect(events(result).map((event) => event.gmProgram)).toEqual([null, null, null]);
  });

  it("compiles GM timbre references", () => {
    const result = compileMml("@gm1 C @GM81 D @gm128 E");
    expect(result.patches.gmPatches).toHaveLength(128);
    expect(result.patches.gmPatches.get(1)?.name).toBe("Acoustic Grand Piano");
    expect(result.patches.gmPatches.get(81)?.builtinTimbre).toBe(0);
    expect(events(result).map((event) => event.gmProgram)).toEqual([1, 81, 128]);
  });

  it("clears GM timbre when returning to legacy timbre numbers", () => {
    const result = compileMml("@gm1 C @4 D");
    expect(events(result).map((event) => event.gmProgram)).toEqual([1, null]);
    expect(events(result).map((event) => event.timbre)).toEqual([0, 4]);
  });

  it("rejects GM timbres outside gm1-gm128", () => {
    expect(() => compileMml("@gm0 C")).toThrow(MmlError);
    expect(() => compileMml("@gm129 C")).toThrow(MmlError);
  });

  it("rejects redefining builtin timbres", () => {
    expect(() => compileMml(bellPatch.replace("@16", "@0"))).toThrow(MmlError);
  });

  it("rejects FM patch ids outside @16-@63", () => {
    expect(() => compileMml(bellPatch.replace("@16", "@64"))).toThrow(MmlError);
  });

  it("rejects duplicate FM patch ids", () => {
    expect(() => compileMml(`${bellPatch}\n${bellPatch}`)).toThrow(MmlError);
  });

  it("rejects undefined user FM timbre references", () => {
    expect(() => compileMml("@16 C")).toThrow(MmlError);
  });

  it("rejects FM patch blocks without %end", () => {
    expect(() => compileMml(bellPatch.replace("%end", ""))).toThrow(MmlError);
  });

  it("rejects invalid FM patch parameter values", () => {
    expect(() => compileMml(bellPatch.replace("ratio=1.00", "ratio=0"))).toThrow(MmlError);
    expect(() => compileMml(bellPatch.replace("level=1.00", "level=2"))).toThrow(MmlError);
    expect(() => compileMml(bellPatch.replace("feedback=2", "feedback=8"))).toThrow(MmlError);
  });

  it("rejects incomplete 4OP FM patches", () => {
    expect(() => compileMml(`${fourOpPatch.replace(/^op4 .+\n/m, "")}\n@17 C`)).toThrow(MmlError);
  });

  it("uses 4/4 as the default time signature", () => {
    const result = compileMml("C");
    expect(result.master.timeSignatureEvents).toEqual([
      { type: "setTimeSignature", tick: 0, numerator: 4, denominator: 4, measureLengthTicks: 1920 }
    ]);
  });

  it("compiles #TIME 3/4", () => {
    const result = compileMml("#TIME 3/4 L4 C D E |");
    expect(result.master.timeSignatureEvents).toEqual([
      { type: "setTimeSignature", tick: 0, numerator: 3, denominator: 4, measureLengthTicks: 1440 }
    ]);
    expect(result.master.measureBoundaries).toContainEqual({ tick: 1440, explicit: true, trackIndex: 0 });
  });

  it("compiles #TIME 6/8", () => {
    const result = compileMml("#TIME 6/8 L8 C D E F G A |");
    expect(result.master.timeSignatureEvents).toEqual([
      { type: "setTimeSignature", tick: 0, numerator: 6, denominator: 8, measureLengthTicks: 1440 }
    ]);
    expect(result.master.measureBoundaries).toContainEqual({ tick: 1440, explicit: true, trackIndex: 0 });
  });

  it("pads a short explicit measure internally", () => {
    const result = compileMml("#TIME 4/4 T120 L4 C D E | G");
    expect(events(result).map((event) => event.startTimeSec)).toEqual([0, 0.5, 1, 2]);
    expect(result.master.measureBoundaries).toContainEqual({ tick: 1920, explicit: true, trackIndex: 0 });
    expect(result.master.diagnostics.some((diagnostic) => diagnostic.message.includes("小節長不足"))).toBe(true);
  });

  it("accepts an exact 4/4 measure", () => {
    const result = compileMml("#TIME 4/4 L4 C D E F |");
    expect(events(result)).toHaveLength(4);
    expect(result.master.measureBoundaries).toContainEqual({ tick: 1920, explicit: true, trackIndex: 0 });
    expect(result.master.diagnostics).toEqual([]);
  });

  it("inserts a virtual measure boundary for an overfull measure", () => {
    const result = compileMml("#TIME 4/4 L4 C D E F G |");
    expect(events(result)).toHaveLength(5);
    expect(result.master.measureBoundaries).toContainEqual({ tick: 1920, explicit: false, trackIndex: 0 });
    expect(result.master.diagnostics.some((diagnostic) => diagnostic.message.includes("小節長超過"))).toBe(true);
  });

  it("does not create NoteEvents from measure bars", () => {
    const result = compileMml("L4 C | D");
    expect(events(result)).toHaveLength(2);
    expect(events(result).map((event) => event.frequencyHz === null)).toEqual([false, false]);
  });

  it("does not split notes that cross measure boundaries", () => {
    const result = compileMml("#TIME 4/4 T120 L1 C. |");
    expect(events(result)).toHaveLength(1);
    expect(events(result)[0].durationSec).toBeCloseTo(3);
    expect(result.master.measureBoundaries).toContainEqual({ tick: 1920, explicit: false, trackIndex: 0 });
  });

  it("throws positioned errors for invalid #TIME", () => {
    for (const source of ["#TIME 4", "#TIME a/b", "#TIME 0/4", "#TIME 4/0", "#TIME 4/3"]) {
      try {
        compileMml(source);
        throw new Error(`Expected ${source} to fail`);
      } catch (error) {
        expect(error).toBeInstanceOf(MmlError);
        expect((error as MmlError).position).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("does not warn when explicit measure bars align across tracks", () => {
    const result = compileMml("L4 C D E F |, L4 C D E F |");
    expect(result.master.diagnostics.some((diagnostic) => diagnostic.message.includes("小節線位置"))).toBe(false);
  });

  it("warns when explicit measure bars do not align across tracks", () => {
    const result = compileMml("L4 C D |, L4 C D E F |");
    expect(result.master.diagnostics.some((diagnostic) => diagnostic.message.includes("小節線位置"))).toBe(true);
  });
});

function events(song: Song): NoteEvent[] {
  return song.tracks
    .flatMap((track) => track.events)
    .sort((a, b) => a.startTimeSec - b.startTimeSec || a.trackIndex - b.trackIndex);
}
