import type { FmOperator, FmPatch, GmPatch } from "./types";

// The GM presets are lightweight Web Audio FM approximations. Their family
// choices and envelopes are informed by the MIT-licensed DMXOPL GENMIDI.op2
// bank bundled with SimK98/ymfmidiwin, but converted to this app's simpler
// serial 2OP/4OP FmPatch model rather than copied as OPL register data.
const gmNames = [
  "Acoustic Grand Piano",
  "Bright Acoustic Piano",
  "Electric Grand Piano",
  "Honky-tonk Piano",
  "Electric Piano 1",
  "Electric Piano 2",
  "Harpsichord",
  "Clavinet",
  "Celesta",
  "Glockenspiel",
  "Music Box",
  "Vibraphone",
  "Marimba",
  "Xylophone",
  "Tubular Bells",
  "Dulcimer",
  "Drawbar Organ",
  "Percussive Organ",
  "Rock Organ",
  "Church Organ",
  "Reed Organ",
  "Accordion",
  "Harmonica",
  "Tango Accordion",
  "Acoustic Guitar Nylon",
  "Acoustic Guitar Steel",
  "Electric Guitar Jazz",
  "Electric Guitar Clean",
  "Electric Guitar Muted",
  "Overdriven Guitar",
  "Distortion Guitar",
  "Guitar Harmonics",
  "Acoustic Bass",
  "Electric Bass Finger",
  "Electric Bass Pick",
  "Fretless Bass",
  "Slap Bass 1",
  "Slap Bass 2",
  "Synth Bass 1",
  "Synth Bass 2",
  "Violin",
  "Viola",
  "Cello",
  "Contrabass",
  "Tremolo Strings",
  "Pizzicato Strings",
  "Orchestral Harp",
  "Timpani",
  "String Ensemble 1",
  "String Ensemble 2",
  "SynthStrings 1",
  "SynthStrings 2",
  "Choir Aahs",
  "Voice Oohs",
  "Synth Voice",
  "Orchestra Hit",
  "Trumpet",
  "Trombone",
  "Tuba",
  "Muted Trumpet",
  "French Horn",
  "Brass Section",
  "SynthBrass 1",
  "SynthBrass 2",
  "Soprano Sax",
  "Alto Sax",
  "Tenor Sax",
  "Baritone Sax",
  "Oboe",
  "English Horn",
  "Bassoon",
  "Clarinet",
  "Piccolo",
  "Flute",
  "Recorder",
  "Pan Flute",
  "Blown Bottle",
  "Shakuhachi",
  "Whistle",
  "Ocarina",
  "Lead 1 Square",
  "Lead 2 Sawtooth",
  "Lead 3 Calliope",
  "Lead 4 Chiff",
  "Lead 5 Charang",
  "Lead 6 Voice",
  "Lead 7 Fifths",
  "Lead 8 Bass + Lead",
  "Pad 1 New Age",
  "Pad 2 Warm",
  "Pad 3 Polysynth",
  "Pad 4 Choir",
  "Pad 5 Bowed",
  "Pad 6 Metallic",
  "Pad 7 Halo",
  "Pad 8 Sweep",
  "FX 1 Rain",
  "FX 2 Soundtrack",
  "FX 3 Crystal",
  "FX 4 Atmosphere",
  "FX 5 Brightness",
  "FX 6 Fantasy",
  "FX 7 Echoes",
  "FX 8 Sci-fi",
  "Sitar",
  "Banjo",
  "Shamisen",
  "Koto",
  "Kalimba",
  "Bag Pipe",
  "Fiddle",
  "Shanai",
  "Tinkle Bell",
  "Agogo",
  "Steel Drums",
  "Woodblock",
  "Taiko Drum",
  "Melodic Tom",
  "Synth Drum",
  "Reverse Cymbal",
  "Guitar Fret Noise",
  "Breath Noise",
  "Seashore",
  "Bird Tweet",
  "Telephone Ring",
  "Helicopter",
  "Applause",
  "Gunshot"
] as const;

let cachedGmPatchEntries: Array<[number, GmPatch]> | null = null;

export function createGmPatches(): Map<number, GmPatch> {
  cachedGmPatchEntries ??= gmNames.map((name, index) => {
      const id = index + 1;
      return [id, createGmPatch(id, name)] as [number, GmPatch];
    });
  return new Map(cachedGmPatchEntries);
}

function createGmPatch(id: number, name: string): GmPatch {
  const kind = "gm" as const;
  if (id <= 4) return { id, name, kind, builtinTimbre: 4, fmPatch: pianoFm(id, name) };
  if (id <= 6) return { id, name, kind, builtinTimbre: 4, fmPatch: electricPianoFm(id, name) };
  if (id <= 8) return { id, name, kind, builtinTimbre: 4, fmPatch: pluckFm(id, name, 0.004) };
  if (id <= 16) return { id, name, kind, builtinTimbre: 4, fmPatch: chromaticFm(id, name) };
  if (id <= 24) return { id, name, kind, builtinTimbre: 1, fmPatch: organFm(id, name) };
  if (id <= 32) return { id, name, kind, builtinTimbre: id >= 30 ? 3 : 2, fmPatch: guitarFm(id, name) };
  if (id <= 40) return { id, name, kind, builtinTimbre: 5, fmPatch: bassFm(id, name) };
  if (id <= 48) return { id, name, kind, builtinTimbre: 2, fmPatch: bowedFm(id, name) };
  if (id <= 56) return { id, name, kind, builtinTimbre: 2, fmPatch: ensembleFm(id, name) };
  if (id <= 64) return { id, name, kind, builtinTimbre: id >= 63 ? 3 : 2, fmPatch: brassFm(id, name) };
  if (id <= 72) return { id, name, kind, builtinTimbre: 1, fmPatch: reedFm(id, name) };
  if (id <= 80) return { id, name, kind, builtinTimbre: 1, fmPatch: pipeFm(id, name) };
  if (id <= 88) return { id, name, kind, builtinTimbre: id === 81 ? 0 : 3, fmPatch: leadFm(id, name) };
  if (id <= 96) return { id, name, kind, builtinTimbre: id >= 94 ? 4 : 2, fmPatch: padFm(id, name) };
  if (id <= 104) return { id, name, kind, builtinTimbre: 4, fmPatch: fxFm(id, name) };
  if (id <= 112) return { id, name, kind, builtinTimbre: 2, fmPatch: ethnicFm(id, name) };
  if (id <= 120) return { id, name, kind, builtinTimbre: id >= 117 ? 6 : 4, fmPatch: percussionFm(id, name) };
  return { id, name, kind, builtinTimbre: 6 };
}

function pianoFm(id: number, name: string): FmPatch {
  const bright = id === 2 ? 1.15 : 1;
  const honky = id === 4 ? 0.98 : 1;
  return patch(id, name, 6, [
    op(1 * honky, 0.82, 0.003, 0.32, 0.18, 0.16),
    op(1, 0.32 * bright, 0.002, 0.18, 0.02, 0.08),
    op(3, 0.22 * bright, 0.001, 0.12, 0, 0.05),
    op(id === 3 ? 0.5 : 2, 0.18, 0.001, 0.24, 0, 0.08)
  ]);
}

function electricPianoFm(id: number, name: string): FmPatch {
  return patch(id, name, 6, [
    op(1, 0.74, 0.006, 0.55, 0.34, 0.24),
    op(id === 6 ? 6 : 4, 0.42, 0.003, 0.32, 0.04, 0.12),
    op(2, 0.24, 0.002, 0.24, 0, 0.1),
    op(1, 0.16, 0.004, 0.42, 0.2, 0.18)
  ]);
}

function chromaticFm(id: number, name: string): FmPatch {
  const ratios = new Map<number, [number, number]>([
    [9, [1, 7]],
    [10, [2, 15]],
    [11, [1, 10]],
    [12, [1, 2]],
    [13, [0.5, 8]],
    [14, [1, 6]],
    [15, [2, 7]],
    [16, [2, 3]]
  ]);
  const [carrier, modulator] = ratios.get(id) ?? [1, 4];
  return patch(id, name, id === 10 ? 6 : 4, [
    op(carrier, 0.78, 0.003, 0.5, id === 12 ? 0.45 : 0.08, 0.18),
    op(modulator, 0.48, 0.002, 0.28, 0, 0.1),
    op(2, 0.18, 0.002, 0.22, 0, 0.08)
  ]);
}

function organFm(id: number, name: string): FmPatch {
  const church = id === 20;
  return patch(id, name, church ? 2 : 1, [
    op(1, 0.78, church ? 0.08 : 0.012, 0.08, 0.82, 0.12),
    op(2, church ? 0.18 : 0.28, 0.012, 0.1, 0.72, 0.1),
    op(3, id === 19 ? 0.22 : 0.12, 0.01, 0.12, 0.6, 0.1)
  ]);
}

function guitarFm(id: number, name: string): FmPatch {
  const driven = id >= 30;
  const muted = id === 29;
  return patch(id, name, driven ? 5 : 2, [
    op(1, 0.7, 0.004, muted ? 0.12 : 0.28, muted ? 0.04 : 0.22, muted ? 0.05 : 0.16),
    op(driven ? 2 : 3, driven ? 0.46 : 0.3, 0.002, muted ? 0.08 : 0.16, 0, 0.06),
    op(1.5, driven ? 0.24 : 0.12, 0.002, 0.1, 0, 0.05)
  ]);
}

function bassFm(id: number, name: string): FmPatch {
  const synth = id >= 39;
  const slap = id === 37 || id === 38;
  return patch(id, name, synth ? 5 : 3, [
    op(0.5, 0.9, 0.004, 0.3, synth ? 0.55 : 0.42, 0.13),
    op(slap ? 2 : 1, slap ? 0.5 : 0.34, 0.002, slap ? 0.08 : 0.16, slap ? 0 : 0.1, 0.08),
    op(1, synth ? 0.28 : 0.12, 0.002, 0.18, 0.05, 0.08)
  ]);
}

function bowedFm(id: number, name: string): FmPatch {
  const pizz = id === 46 || id === 47;
  if (pizz) return pluckFm(id, name, 0.006);
  return patch(id, name, 0, [
    op(1, 0.54, 0.1, 0.38, 0.7, 0.28),
    op(2, 0.06, 0.12, 0.36, 0.35, 0.24)
  ]);
}

function ensembleFm(id: number, name: string): FmPatch {
  const choir = id >= 53 && id <= 55;
  return patch(id, name, 1, [
    op(1, 0.58, 0.12, 0.5, 0.76, 0.35),
    op(choir ? 1.5 : 2, choir ? 0.12 : 0.2, 0.15, 0.5, 0.55, 0.3),
    op(0.5, 0.1, 0.18, 0.6, 0.65, 0.35)
  ]);
}

function brassFm(id: number, name: string): FmPatch {
  const synth = id >= 63;
  return patch(id, name, synth ? 3 : 2, [
    op(1, 0.8, synth ? 0.018 : 0.035, 0.22, 0.68, 0.16),
    op(synth ? 1 : 2, synth ? 0.4 : 0.28, 0.02, 0.18, 0.34, 0.12),
    op(3, synth ? 0.18 : 0.08, 0.02, 0.16, 0.18, 0.1)
  ]);
}

function reedFm(id: number, name: string): FmPatch {
  return patch(id, name, 1, [
    op(1, 0.7, 0.025, 0.2, 0.7, 0.14),
    op(id <= 68 ? 2 : 1.5, 0.18, 0.02, 0.18, 0.45, 0.12)
  ]);
}

function pipeFm(id: number, name: string): FmPatch {
  return patch(id, name, 1, [
    op(1, 0.62, 0.035, 0.22, 0.74, 0.18),
    op(id === 77 ? 3 : 2, id >= 77 ? 0.28 : 0.14, 0.03, 0.16, 0.34, 0.12)
  ]);
}

function leadFm(id: number, name: string): FmPatch {
  const square = id === 81;
  const fifth = id === 87;
  return patch(id, name, square ? 2 : 4, [
    op(fifth ? 0.5 : 1, 0.74, 0.008, 0.16, 0.64, 0.12),
    op(square ? 2 : id === 82 ? 0.5 : 4, square ? 0.28 : 0.36, 0.004, 0.14, 0.28, 0.1),
    op(fifth ? 3 : 2, fifth ? 0.26 : 0.12, 0.004, 0.12, 0.2, 0.08)
  ]);
}

function padFm(id: number, name: string): FmPatch {
  const metallic = id === 94 || id === 99;
  return patch(id, name, metallic ? 3 : 1, [
    op(1, 0.58, 0.18, 0.75, 0.72, 0.55),
    op(metallic ? 5 : 2, metallic ? 0.32 : 0.18, 0.2, 0.65, 0.46, 0.45),
    op(0.5, 0.12, 0.22, 0.7, 0.6, 0.5)
  ]);
}

function fxFm(id: number, name: string): FmPatch {
  return patch(id, name, 4, [
    op(1, 0.58, 0.08, 0.8, 0.45, 0.5),
    op(id === 99 ? 8 : 5, 0.4, 0.03, 0.5, 0.08, 0.3),
    op(2, 0.16, 0.1, 0.8, 0.25, 0.4)
  ]);
}

function ethnicFm(id: number, name: string): FmPatch {
  const plucked = id <= 109;
  return plucked ? pluckFm(id, name, 0.004) : reedFm(id, name);
}

function percussionFm(id: number, name: string): FmPatch {
  if (id === 117 || id === 118 || id === 119) {
    return patch(id, name, 5, [
      op(1, 0.72, 0.002, 0.16, 0, 0.08),
      op(6, 0.5, 0.001, 0.06, 0, 0.04)
    ]);
  }
  return patch(id, name, 3, [
    op(1, 0.68, 0.004, 0.28, 0.08, 0.16),
    op(4, 0.35, 0.002, 0.12, 0, 0.08)
  ]);
}

function pluckFm(id: number, name: string, attack: number): FmPatch {
  return patch(id, name, 2, [
    op(1, 0.74, attack, 0.24, 0.16, 0.12),
    op(3, 0.34, 0.002, 0.12, 0, 0.06),
    op(2, 0.12, 0.002, 0.1, 0, 0.05)
  ]);
}

function patch(id: number, name: string, feedback: number, operators: FmOperator[]): FmPatch {
  return {
    id,
    name,
    algorithm: 0,
    feedback,
    operators
  };
}

function op(ratio: number, level: number, attack: number, decay: number, sustain: number, release: number): FmOperator {
  return { ratio, detune: 0, level, attack, decay, sustain, release };
}
