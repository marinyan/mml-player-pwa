import { describe, expect, it } from "vitest";
import { createMmlTextBlob } from "./fileText";

describe("createMmlTextBlob", () => {
  it("keeps FM patch blocks in exported text", async () => {
    const source = `%fm @16 name="Bell"
algorithm=0
feedback=2
op1 ratio=1.00 detune=0 level=1.00 attack=0.01 decay=0.30 sustain=0.40 release=0.20
op2 ratio=2.00 detune=0 level=0.60 attack=0.01 decay=0.20 sustain=0.00 release=0.10
%end

@16 C D E`;
    await expect(createMmlTextBlob(source).text()).resolves.toBe(source);
  });
});
