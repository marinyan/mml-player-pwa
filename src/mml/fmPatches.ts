import { MmlError, type FmOperator, type FmPatch, type PatchRegistry } from "./types";

interface ExtractedFmPatches {
  mml: string;
  patches: PatchRegistry;
}

interface SourceLine {
  text: string;
  start: number;
  newline: string;
}

type OperatorKey = keyof FmOperator;

const builtinPatchIds = Array.from({ length: 16 }, (_, id) => id);
const requiredOperatorKeys: OperatorKey[] = ["ratio", "detune", "level", "attack", "decay", "sustain", "release"];

export function extractFmPatches(source: string): ExtractedFmPatches {
  const lines = splitLines(source);
  const strippedLines: string[] = [];
  const userFmPatches = new Map<number, FmPatch>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.text.trim();

    if (/^%end$/i.test(trimmed)) {
      throw new MmlError(line.start, "%end without matching %fm");
    }

    if (!/^%fm\b/i.test(trimmed)) {
      strippedLines.push(line.text + line.newline);
      continue;
    }

    const blockStart = line.start;
    const header = parseHeader(line);
    if (header.id < 16) throw new MmlError(blockStart, "Builtin timbres @0-@15 cannot be redefined");
    if (header.id > 63) throw new MmlError(blockStart, "FM timbre id must be @16-@63");
    if (userFmPatches.has(header.id)) throw new MmlError(blockStart, `FM timbre @${header.id} is already defined`);

    strippedLines.push(line.newline);
    const bodyLines: SourceLine[] = [];
    let foundEnd = false;

    for (index += 1; index < lines.length; index += 1) {
      const bodyLine = lines[index];
      strippedLines.push(bodyLine.newline);
      if (/^%end$/i.test(bodyLine.text.trim())) {
        foundEnd = true;
        break;
      }
      bodyLines.push(bodyLine);
    }

    if (!foundEnd) {
      throw new MmlError(blockStart, "%fm block requires %end");
    }

    userFmPatches.set(header.id, parsePatchBody(header.id, header.name, bodyLines));
  }

  return {
    mml: strippedLines.join(""),
    patches: {
      builtinPatches: new Map(builtinPatchIds.map((id) => [id, { id, kind: "builtin" as const }])),
      userFmPatches
    }
  };
}

function parseHeader(line: SourceLine): { id: number; name: string } {
  const match = line.text.trim().match(/^%fm\s+@(\d+)\s+name="([^"]+)"\s*$/i);
  if (!match) {
    throw new MmlError(line.start, '%fm header must be like %fm @16 name="PatchName"');
  }
  return { id: Number(match[1]), name: match[2] };
}

function parsePatchBody(id: number, name: string, lines: SourceLine[]): FmPatch {
  let algorithm: number | null = null;
  let feedback: number | null = null;
  const operators = new Map<number, FmOperator>();

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;

    if (trimmed.startsWith("algorithm=")) {
      algorithm = parseIntegerValue(trimmed.slice("algorithm=".length), line.start, "algorithm");
      if (algorithm !== 0) throw new MmlError(line.start, "Only FM algorithm=0 is supported");
      continue;
    }

    if (trimmed.startsWith("feedback=")) {
      feedback = parseIntegerValue(trimmed.slice("feedback=".length), line.start, "feedback");
      if (feedback < 0 || feedback > 7) throw new MmlError(line.start, "feedback must be 0-7");
      continue;
    }

    const opMatch = trimmed.match(/^op([12])\s+(.+)$/i);
    if (opMatch) {
      const opIndex = Number(opMatch[1]);
      operators.set(opIndex, parseOperator(opMatch[2], line.start));
      continue;
    }

    throw new MmlError(line.start, `Unknown FM patch field: ${trimmed}`);
  }

  if (algorithm === null) throw new MmlError(0, `FM patch @${id} requires algorithm`);
  if (feedback === null) throw new MmlError(0, `FM patch @${id} requires feedback`);
  if (!operators.has(1)) throw new MmlError(0, `FM patch @${id} requires op1`);
  if (!operators.has(2)) throw new MmlError(0, `FM patch @${id} requires op2`);

  return {
    id,
    name,
    algorithm,
    feedback,
    operators: [operators.get(1)!, operators.get(2)!]
  };
}

function parseOperator(text: string, position: number): FmOperator {
  const values = new Map<string, number>();
  for (const part of text.split(/\s+/)) {
    const [key, rawValue] = part.split("=");
    if (!key || rawValue === undefined) throw new MmlError(position, `Invalid operator parameter: ${part}`);
    if (!requiredOperatorKeys.includes(key as OperatorKey)) {
      throw new MmlError(position, `Unknown operator parameter: ${key}`);
    }
    values.set(key, parseNumberValue(rawValue, position, key));
  }

  for (const key of requiredOperatorKeys) {
    if (!values.has(key)) throw new MmlError(position, `Operator requires ${key}`);
  }

  const operator = Object.fromEntries(values) as unknown as FmOperator;
  validateOperator(operator, position);
  return operator;
}

function validateOperator(operator: FmOperator, position: number): void {
  if (operator.ratio <= 0) throw new MmlError(position, "operator ratio must be greater than 0");
  if (operator.level < 0 || operator.level > 1) throw new MmlError(position, "operator level must be 0.0-1.0");
  if (operator.attack < 0) throw new MmlError(position, "operator attack must be 0 or greater");
  if (operator.decay < 0) throw new MmlError(position, "operator decay must be 0 or greater");
  if (operator.sustain < 0 || operator.sustain > 1) throw new MmlError(position, "operator sustain must be 0.0-1.0");
  if (operator.release < 0) throw new MmlError(position, "operator release must be 0 or greater");
}

function parseIntegerValue(value: string, position: number, name: string): number {
  const parsed = parseNumberValue(value, position, name);
  if (!Number.isInteger(parsed)) throw new MmlError(position, `${name} must be an integer`);
  return parsed;
}

function parseNumberValue(value: string, position: number, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new MmlError(position, `${name} must be a number`);
  return parsed;
}

function splitLines(source: string): SourceLine[] {
  const matches = source.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g);
  const lines: SourceLine[] = [];
  let position = 0;

  for (const match of matches) {
    const text = match[1];
    const newline = match[2];
    if (text === "" && newline === "") break;
    lines.push({ text, newline, start: position });
    position += text.length + newline.length;
  }

  return lines;
}
