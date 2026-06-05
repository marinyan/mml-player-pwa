import { describe, expect, it, vi } from "vitest";
import { defaultMml } from "../demo/defaultMml";
import { compileMml } from "../mml/compiler";
import { type Song } from "../mml/types";
import { encodePcm16Wav, estimateWavBytes, renderSongToWav, type AudioBufferLike } from "./wav";

const fmPatch = `%fm @16 name="Bell"
algorithm=0
feedback=2
op1 ratio=1.00 detune=0 level=1.00 attack=0.01 decay=0.30 sustain=0.40 release=0.20
op2 ratio=2.00 detune=0 level=0.60 attack=0.01 decay=0.20 sustain=0.00 release=0.10
%end`;

describe("encodePcm16Wav", () => {
  it("writes a valid RIFF/WAVE header", async () => {
    const blob = encodePcm16Wav(new Float32Array([0, 0.5]), 44100);
    const view = new DataView(await blob.arrayBuffer());

    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(40);
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(4);
  });

  it("encodes clipped samples as 16bit PCM", async () => {
    const blob = encodePcm16Wav(new Float32Array([-2, 0, 2]), 22050);
    const view = new DataView(await blob.arrayBuffer());

    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(32767);
  });

  it("encodes stereo samples as interleaved 16bit PCM", async () => {
    const blob = encodePcm16Wav([new Float32Array([0.25, 0.5]), new Float32Array([-0.25, -0.5])], 44100);
    const view = new DataView(await blob.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBeCloseTo(8191, 0);
    expect(view.getInt16(46, true)).toBeCloseTo(-8192, 0);
    expect(view.getInt16(48, true)).toBeCloseTo(16383, 0);
    expect(view.getInt16(50, true)).toBeCloseTo(-16384, 0);
  });
});

describe("renderSongToWav", () => {
  it("renders a short MML song into a WAV blob", async () => {
    const song = compileMml("T120 O4 L4 C");
    const renderAudio = vi.fn(createRenderAudio());

    const blob = await renderSongToWav(song, { sampleRate: 8000, tailSec: 0.25, renderAudio });
    const view = new DataView(await blob.arrayBuffer());

    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(renderAudio).toHaveBeenCalledWith(song, expect.objectContaining({ sampleRate: 8000, channelCount: 2 }));
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(40, true)).toBeGreaterThan(0);
  });

  it("throws when the song has no audible NoteEvents", async () => {
    await expect(renderSongToWav(compileMml("R"), { renderAudio: createRenderAudio() })).rejects.toThrow(
      "at least one audible note"
    );
  });

  it("passes MML-defined FM patches through the WAV render path", async () => {
    const song = compileMml(`${fmPatch}\nT120 @16 C`);
    const renderAudio = vi.fn(async (renderedSong: Song, options: { sampleRate: number; durationSec: number; channelCount: number }) => {
      expect(renderedSong.patches.userFmPatches.get(16)?.operators).toHaveLength(2);
      expect(renderedSong.tracks[0].events[0].timbre).toBe(16);
      return new TestAudioBuffer(options.sampleRate, Math.ceil(options.durationSec * options.sampleRate), options.channelCount);
    });

    const blob = await renderSongToWav(song, { sampleRate: 8000, renderAudio });

    expect(blob.type).toBe("audio/wav");
    expect(renderAudio).toHaveBeenCalledOnce();
  });

  it("passes GM timbre references through the WAV render path", async () => {
    const song = compileMml("T120 @gm5 C @gm81 D");
    const renderAudio = vi.fn(async (renderedSong: Song, options: { sampleRate: number; durationSec: number; channelCount: number }) => {
      expect(renderedSong.patches.gmPatches.get(5)?.fmPatch?.operators.length).toBeGreaterThanOrEqual(2);
      expect(renderedSong.patches.gmPatches.get(81)?.builtinTimbre).toBe(0);
      expect(renderedSong.tracks[0].events.map((event) => event.gmProgram)).toEqual([5, 81]);
      return new TestAudioBuffer(options.sampleRate, Math.ceil(options.durationSec * options.sampleRate), options.channelCount);
    });

    const blob = await renderSongToWav(song, { sampleRate: 8000, renderAudio });

    expect(blob.type).toBe("audio/wav");
    expect(renderAudio).toHaveBeenCalledOnce();
  });

  it("can export the bundled demo song through the WAV render path", async () => {
    const song = compileMml(defaultMml);
    const renderAudio = vi.fn(createRenderAudio());

    const blob = await renderSongToWav(song, { sampleRate: 8000, renderAudio });

    expect(blob.size).toBeGreaterThan(44);
    expect(renderAudio).toHaveBeenCalledWith(song, expect.objectContaining({ durationSec: expect.any(Number) }));
    expect(renderAudio.mock.calls[0][1].durationSec).toBeGreaterThan(0);
  });

  it("estimates the 44.1kHz mono 16bit WAV size", () => {
    const song = compileMml("T120 O4 L4 C");

    expect(estimateWavBytes(song, 44100, 1, 1)).toBe(44 + Math.ceil(1.5 * 44100) * 2);
  });

  it("estimates the default stereo 16bit WAV size", () => {
    const song = compileMml("T120 O4 L4 C");

    expect(estimateWavBytes(song, 44100, 1)).toBe(44 + Math.ceil(1.5 * 44100) * 2 * 2);
  });
});

function createRenderAudio(): (song: Song, options: { sampleRate: number; durationSec: number; channelCount: number }) => Promise<AudioBufferLike> {
  return async (_song, options) =>
    new TestAudioBuffer(options.sampleRate, Math.ceil(options.durationSec * options.sampleRate), options.channelCount);
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}

class TestAudioBuffer implements AudioBufferLike {
  private readonly data: Float32Array[];

  constructor(
    readonly sampleRate: number,
    readonly length: number,
    readonly numberOfChannels = 1
  ) {
    this.data = Array.from({ length: numberOfChannels }, (_, channel) => {
      const data = new Float32Array(length);
      for (let index = 0; index < length; index += 1) {
        data[index] = Math.sin(index / 8 + channel) * 0.25;
      }
      return data;
    });
  }

  getChannelData(channel: number): Float32Array {
    return this.data[channel];
  }
}
