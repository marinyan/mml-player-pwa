import { describe, expect, it } from "vitest";
import { createTempoMap } from "./tempoMap";

describe("createTempoMap", () => {
  it("converts seconds across multiple tempo segments", () => {
    const tempoMap = createTempoMap([
      { type: "setTempo", timeSec: 0, tempo: 120 },
      { type: "setTempo", timeSec: 1, tempo: 60 },
      { type: "setTempo", timeSec: 3, tempo: 240 }
    ]);

    expect(tempoMap.secondsToTicks(0.5)).toBe(480);
    expect(tempoMap.secondsToTicks(2)).toBe(1440);
    expect(tempoMap.secondsToTicks(3.5)).toBe(2880);
  });

  it("uses the last tempo event at the same time", () => {
    const tempoMap = createTempoMap([
      { type: "setTempo", timeSec: 0, tempo: 60 },
      { type: "setTempo", timeSec: 0, tempo: 240 }
    ]);

    expect(tempoMap.secondsToTicks(1)).toBe(1920);
  });
});
