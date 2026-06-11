import { describe, expect, it } from "vitest";
import { createGmPatches } from "./gmPatches";

describe("createGmPatches", () => {
  it("reuses generated patch objects while isolating registry mutations", () => {
    const first = createGmPatches();
    const second = createGmPatches();

    expect(first).not.toBe(second);
    expect(first.get(1)).toBe(second.get(1));

    first.delete(1);
    expect(second.has(1)).toBe(true);
  });
});
