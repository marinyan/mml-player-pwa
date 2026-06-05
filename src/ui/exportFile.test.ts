import { describe, expect, it, vi } from "vitest";
import { ensureExtension, requestExportFileName, sanitizeFileName } from "./exportFile";

describe("export file names", () => {
  it("uses the user supplied export file name and appends the expected extension", () => {
    const prompt = vi.fn(() => "my song");

    expect(requestExportFileName("mml-player.mml", ".mml", prompt)).toBe("my song.mml");
    expect(prompt).toHaveBeenCalledWith("保存するファイル名を入力してください", "mml-player.mml");
  });

  it("keeps an existing extension case-insensitively", () => {
    const prompt = vi.fn(() => "mix.WAV");

    expect(requestExportFileName("mml-export.wav", ".wav", prompt)).toBe("mix.WAV");
  });

  it("cancels export when the prompt is cancelled", () => {
    expect(requestExportFileName("mml-export.wav", ".wav", () => null)).toBeNull();
  });

  it("falls back to the default name when the sanitized answer is empty", () => {
    expect(requestExportFileName("mml-player.mml", ".mml", () => "   ")).toBe("mml-player.mml");
  });

  it("sanitizes characters that are awkward in download names", () => {
    expect(sanitizeFileName('demo:lead/part?.mml ')).toBe("demo_lead_part_.mml");
  });

  it("appends extensions only when missing", () => {
    expect(ensureExtension("song", ".mml")).toBe("song.mml");
    expect(ensureExtension("song.mml", ".mml")).toBe("song.mml");
  });
});
