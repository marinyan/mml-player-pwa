import { describe, expect, it } from "vitest";
import { compileMml } from "./compiler";
import { extractFmPatches } from "./fmPatches";
import { expandRepeats } from "./repeatExpander";
import { MmlError, type NoteEvent, type Song } from "./types";

const bellPatch = `%fm @16 name="Bell"
algorithm=0
feedback=2
op1 ratio=1.00 detune=0 level=1.00 attack=0.01 decay=0.30 sustain=0.40 release=0.20
op2 ratio=2.00 detune=0 level=0.60 attack=0.01 decay=0.20 sustain=0.00 release=0.10
%end`;

describe("expandRepeats", () => {
  it("expands explicit repeat counts", () => {
    expect(expandRepeats("[: C D :2]")).toBe(" C D  C D ");
  });

  it("uses 2 repeats when count is omitted", () => {
    expect(expandRepeats("[: C D :]")).toBe(" C D  C D ");
  });

  it("supports a single repeat", () => {
    expect(events(compileMml("[: C D :1]")).map((event) => event.startTimeSec)).toEqual([0, 0.5]);
  });

  it("supports three repeats", () => {
    expect(events(compileMml("[: C D :3]"))).toHaveLength(6);
  });

  it("throws when repeat start is not closed", () => {
    expect(() => expandRepeats("[: C D")).toThrow(MmlError);
  });

  it("throws when repeat end has no start", () => {
    expect(() => expandRepeats("C D :2]")).toThrow(MmlError);
  });

  it("throws on nested repeats", () => {
    expect(() => expandRepeats("[: [: C D :2] :2]")).toThrow(MmlError);
  });

  it("throws on zero repeats", () => {
    expect(() => expandRepeats("[: C D :0]")).toThrow(MmlError);
  });

  it("throws on decimal or non-numeric repeat counts", () => {
    expect(() => expandRepeats("[: C D :1.5]")).toThrow(MmlError);
    expect(() => expandRepeats("[: C D :abc]")).toThrow(MmlError);
    expect(() => expandRepeats("[: C D :-1]")).toThrow(MmlError);
  });

  it("throws when expanded MML is too long", () => {
    expect(() => expandRepeats(`[: ${"C ".repeat(1000)}:200]`)).toThrow(MmlError);
  });

  it("expands repeats independently across tracks", () => {
    const result = compileMml("[: C D :2],[: E F :3]");
    expect(result.tracks.map((track) => track.events.length)).toEqual([4, 6]);
  });

  it("treats repeated measure bars as measure bars after expansion", () => {
    const result = compileMml("#TIME 4/4 L4 [: C D E F | :2]");
    expect(result.master.measureBoundaries.filter((boundary) => boundary.explicit)).toHaveLength(2);
    expect(events(result)).toHaveLength(8);
  });

  it("does not expand repeat symbols inside FM patch blocks", () => {
    const source = bellPatch.replace('name="Bell"', 'name="Bell [: C D :4]"') + "\n@16 C";
    const extracted = extractFmPatches(source);
    expect(extracted.patches.userFmPatches.get(16)?.name).toBe("Bell [: C D :4]");
    expect(expandRepeats(extracted.mml)).not.toContain("C D C D");
  });

  it("expands timbre changes inside repeats", () => {
    const result = compileMml(`${bellPatch}\n[: @16 C D :2]`);
    expect(events(result).map((event) => event.timbre)).toEqual([16, 16, 16, 16]);
  });
});

function events(song: Song): NoteEvent[] {
  return song.tracks
    .flatMap((track) => track.events)
    .sort((a, b) => a.startTimeSec - b.startTimeSec || a.trackIndex - b.trackIndex);
}
