import { describe, expect, it, vi } from "vitest";
import { confirmBeforeReplacingMml, defaultMml, shouldWarnBeforeReplacingMml } from "./app";
import { compileMml } from "./mml/compiler";
import { loadLastExportedMml, saveLastExportedMml } from "./storage/localStorage";

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

describe("replace warning", () => {
  it("does not warn after the current MML has been exported", () => {
    const currentMml = "T120 O4 C";
    const confirm = vi.fn(() => true);

    expect(shouldWarnBeforeReplacingMml(currentMml, currentMml)).toBe(false);
    expect(confirmBeforeReplacingMml(currentMml, currentMml, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("warns after editing the MML following export", () => {
    const exportedMml = "T120 O4 C";
    const editedMml = `${exportedMml} D`;
    const confirm = vi.fn(() => true);

    expect(shouldWarnBeforeReplacingMml(editedMml, exportedMml)).toBe(true);
    expect(confirmBeforeReplacingMml(editedMml, exportedMml, confirm)).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("warns before loading the demo over unexported MML", () => {
    const unexportedMml = "T132 O5 L8 C E G";
    const confirm = vi.fn(() => false);

    expect(shouldWarnBeforeReplacingMml(unexportedMml, null)).toBe(true);
    expect(confirmBeforeReplacingMml(unexportedMml, null, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("does not warn when the current MML is already the demo song", () => {
    const confirm = vi.fn(() => true);

    expect(shouldWarnBeforeReplacingMml(defaultMml, null)).toBe(false);
    expect(confirmBeforeReplacingMml(defaultMml, null, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("last exported MML storage", () => {
  it("stores and loads the exported MML snapshot used by warning checks", () => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: storage },
      configurable: true
    });

    saveLastExportedMml("T120 O4 C");

    expect(loadLastExportedMml()).toBe("T120 O4 C");
    expect(shouldWarnBeforeReplacingMml("T120 O4 C", loadLastExportedMml())).toBe(false);
    expect(shouldWarnBeforeReplacingMml("T120 O4 C D", loadLastExportedMml())).toBe(true);
  });
});

function timbres(song: ReturnType<typeof compileMml>): number[] {
  return song.tracks.flatMap((track) => track.events.map((event) => event.timbre));
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
