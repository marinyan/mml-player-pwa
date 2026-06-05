import { describe, expect, it } from "vitest";
import { compileMml } from "../mml/compiler";
import { defaultMml } from "./defaultMml";

describe("default demo song", () => {
  it("registers the 4OP FM patch and uses it in the demo performance", () => {
    const song = compileMml(defaultMml);
    const patch = song.patches.userFmPatches.get(17);

    expect(patch?.name).toBe("FourOpLead");
    expect(patch?.operators).toHaveLength(4);
    expect(timbres(song)).toContain(17);
  });

  it("keeps 2OP user FM and builtin timbres working in the demo", () => {
    const song = compileMml(defaultMml);

    expect(song.patches.userFmPatches.get(16)?.operators).toHaveLength(2);
    expect(song.patches.builtinPatches.get(5)).toEqual({ id: 5, kind: "builtin" });
    expect(song.patches.builtinPatches.get(6)).toEqual({ id: 6, kind: "builtin" });
    expect(timbres(song)).toEqual(expect.arrayContaining([16, 17, 5, 6]));
  });
});

function timbres(song: ReturnType<typeof compileMml>): number[] {
  return song.tracks.flatMap((track) => track.events.map((event) => event.timbre));
}
