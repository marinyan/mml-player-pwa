import { describe, expect, it } from "vitest";
import { formatPosition } from "./position";

describe("formatPosition", () => {
  it("formats the current and maximum positions", () => {
    expect(formatPosition(3.25, 12.75)).toBe("3.3s / 12.8s");
  });

  it("clamps the current position into the song duration", () => {
    expect(formatPosition(-1, 10)).toBe("0.0s / 10.0s");
    expect(formatPosition(12, 10)).toBe("10.0s / 10.0s");
  });
});
