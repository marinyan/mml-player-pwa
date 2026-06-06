import { describe, expect, it } from "vitest";
import { compileMml } from "../mml/compiler";
import { exportSongToSmf, gmTrackCount } from "./smf";

describe("SMF export", () => {
  it("writes a format 1 SMF with GM System On in the conductor track", async () => {
    const bytes = new Uint8Array(await exportSongToSmf(compileMml("T120 @gm1 C")).arrayBuffer());

    expect(ascii(bytes, 0, 4)).toBe("MThd");
    expect(uint16(bytes, 8)).toBe(1);
    expect(uint16(bytes, 10)).toBe(2);
    expect(uint16(bytes, 12)).toBe(480);
    expect(findSequence(bytes, [0xf0, 0x05, 0x7e, 0x7f, 0x09, 0x01, 0xf7])).toBeGreaterThanOrEqual(0);
  });

  it("exports only tracks containing GM notes", async () => {
    const song = compileMml("@0 C, @gm5 D, @16 E\n%fm @16 name=\"Bell\"\nalgorithm=0\nfeedback=0\nop1 ratio=1 detune=0 level=1 attack=0 decay=0 sustain=1 release=0\nop2 ratio=2 detune=0 level=0.5 attack=0 decay=0 sustain=1 release=0\n%end");
    const bytes = new Uint8Array(await exportSongToSmf(song).arrayBuffer());

    expect(gmTrackCount(song)).toBe(1);
    expect(uint16(bytes, 10)).toBe(2);
    expect(countStatus(bytes, 0x90)).toBe(1);
  });

  it("writes GM program change, volume, pan, and note events", async () => {
    const bytes = new Uint8Array(await exportSongToSmf(compileMml("T120 V15 P+1.0 @gm81 O4 C")).arrayBuffer());

    expect(findSequence(bytes, [0xc0, 80])).toBeGreaterThanOrEqual(0);
    expect(findSequence(bytes, [0xb0, 7, 127])).toBeGreaterThanOrEqual(0);
    expect(findSequence(bytes, [0xb0, 10, 127])).toBeGreaterThanOrEqual(0);
    expect(findSequence(bytes, [0x90, 60, 127])).toBeGreaterThanOrEqual(0);
    expect(findSequence(bytes, [0x80, 60, 0])).toBeGreaterThanOrEqual(0);
  });

  it("exports inline chord notes at the same MIDI tick", async () => {
    const bytes = new Uint8Array(await exportSongToSmf(compileMml("@gm1 (CEG)4")).arrayBuffer());

    expect(countStatus(bytes, 0x90)).toBe(3);
    expect(findSequence(bytes, [0x90, 60, 102, 0x00, 0x90, 64, 102, 0x00, 0x90, 67, 102])).toBeGreaterThanOrEqual(0);
  });

  it("keeps separate GM MML tracks as separate SMF tracks", async () => {
    const song = compileMml("@gm1 C, @gm41 E");
    const bytes = new Uint8Array(await exportSongToSmf(song).arrayBuffer());

    expect(gmTrackCount(song)).toBe(2);
    expect(uint16(bytes, 10)).toBe(3);
    expect(findSequence(bytes, [0xc0, 0])).toBeGreaterThanOrEqual(0);
    expect(findSequence(bytes, [0xc1, 40])).toBeGreaterThanOrEqual(0);
  });

  it("reserves GM Channel 10 for percussion", async () => {
    const song = compileMml(Array.from({ length: 10 }, (_, index) => `@gm${index + 1} C`).join(","));
    const bytes = new Uint8Array(await exportSongToSmf(song).arrayBuffer());

    expect(findStatus(bytes, 0xc9)).toBe(-1);
    expect(findStatus(bytes, 0xca)).toBeGreaterThanOrEqual(0);
  });

  it("rejects songs without GM notes", () => {
    expect(() => exportSongToSmf(compileMml("@0 C @4 D"))).toThrow("at least one @gm note");
  });
});

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function findSequence(bytes: Uint8Array, sequence: number[]): number {
  for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
    if (sequence.every((value, sequenceIndex) => bytes[index + sequenceIndex] === value)) return index;
  }
  return -1;
}

function countStatus(bytes: Uint8Array, status: number): number {
  return [...bytes].filter((value) => value === status).length;
}

function findStatus(bytes: Uint8Array, status: number): number {
  return [...bytes].findIndex((value) => value === status);
}
