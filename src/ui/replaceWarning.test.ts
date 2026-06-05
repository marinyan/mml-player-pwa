import { describe, expect, it, vi } from "vitest";
import { defaultMml } from "../demo/defaultMml";
import { loadLastExportedMml, saveLastExportedMml } from "../storage/localStorage";
import { confirmBeforeReplacingMml, shouldWarnBeforeReplacingMml } from "./replaceWarning";

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

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
