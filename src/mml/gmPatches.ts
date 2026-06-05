import type { FmOperator, FmPatch, GmPatch } from "./types";

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

export function createGmPatches(): Map<number, GmPatch> {
  return new Map(
    gmNames.map((name, index) => {
      const id = index + 1;
      return [id, createGmPatch(id, name)];
    })
  );
}

function createGmPatch(id: number, name: string): GmPatch {
  const kind = "gm" as const;
  if (id <= 8) return { id, name, kind, builtinTimbre: 4, fmPatch: percussiveFm(id, name, 1, 2.4) };
  if (id <= 16) return { id, name, kind, builtinTimbre: 4, fmPatch: percussiveFm(id, name, 1, id <= 12 ? 3 : 4) };
  if (id <= 24) return { id, name, kind, builtinTimbre: 1, fmPatch: organFm(id, name) };
  if (id <= 32) return { id, name, kind, builtinTimbre: id >= 30 ? 3 : 2, fmPatch: pluckFm(id, name) };
  if (id <= 40) return { id, name, kind, builtinTimbre: 5, fmPatch: bassFm(id, name) };
  if (id <= 56) return { id, name, kind, builtinTimbre: 2 };
  if (id <= 64) return { id, name, kind, builtinTimbre: id >= 63 ? 3 : 2, fmPatch: brassFm(id, name) };
  if (id <= 80) return { id, name, kind, builtinTimbre: 1 };
  if (id <= 88) return { id, name, kind, builtinTimbre: id === 81 ? 0 : 3 };
  if (id <= 96) return { id, name, kind, builtinTimbre: id >= 94 ? 4 : 2, fmPatch: padFm(id, name) };
  if (id <= 104) return { id, name, kind, builtinTimbre: 4, fmPatch: percussiveFm(id, name, 1, 5) };
  if (id <= 112) return { id, name, kind, builtinTimbre: 2, fmPatch: pluckFm(id, name) };
  if (id <= 120) return { id, name, kind, builtinTimbre: id >= 117 ? 6 : 4 };
  return { id, name, kind, builtinTimbre: 6 };
}

function percussiveFm(id: number, name: string, carrierRatio: number, modRatio: number): FmPatch {
  return {
    id,
    name,
    algorithm: 0,
    feedback: 2,
    operators: [
      op(carrierRatio, 0.85, 0.004, 0.45, 0.08, 0.16),
      op(modRatio, 0.55, 0.002, 0.24, 0, 0.08)
    ]
  };
}

function organFm(id: number, name: string): FmPatch {
  return {
    id,
    name,
    algorithm: 0,
    feedback: 1,
    operators: [
      op(1, 0.8, 0.01, 0.1, 0.75, 0.08),
      op(2, 0.28, 0.01, 0.12, 0.65, 0.08)
    ]
  };
}

function pluckFm(id: number, name: string): FmPatch {
  return {
    id,
    name,
    algorithm: 0,
    feedback: 2,
    operators: [
      op(1, 0.75, 0.004, 0.22, 0.2, 0.12),
      op(3, 0.36, 0.002, 0.12, 0, 0.06)
    ]
  };
}

function bassFm(id: number, name: string): FmPatch {
  return {
    id,
    name,
    algorithm: 0,
    feedback: 3,
    operators: [
      op(0.5, 0.9, 0.004, 0.28, 0.45, 0.12),
      op(1, 0.42, 0.002, 0.16, 0.1, 0.08)
    ]
  };
}

function brassFm(id: number, name: string): FmPatch {
  return {
    id,
    name,
    algorithm: 0,
    feedback: 2,
    operators: [
      op(1, 0.82, 0.025, 0.2, 0.65, 0.14),
      op(2, 0.3, 0.02, 0.18, 0.35, 0.1)
    ]
  };
}

function padFm(id: number, name: string): FmPatch {
  return {
    id,
    name,
    algorithm: 0,
    feedback: 1,
    operators: [
      op(1, 0.62, 0.18, 0.7, 0.7, 0.45),
      op(2, 0.22, 0.2, 0.6, 0.45, 0.4)
    ]
  };
}

function op(ratio: number, level: number, attack: number, decay: number, sustain: number, release: number): FmOperator {
  return { ratio, detune: 0, level, attack, decay, sustain, release };
}
