import { MmlError } from "./types";

const maxExpandedLength = 200_000;

export function expandRepeats(source: string): string {
  let output = "";
  let repeatStartSource: number | null = null;
  let repeatStartOutput: number | null = null;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        output += source[index];
        index += 1;
      }
      if (index < source.length) output += source[index];
      continue;
    }

    if (source[index] === "[" && source[index + 1] === ":") {
      if (repeatStartSource !== null) {
        throw new MmlError(index, "Nested repeats are not supported");
      }
      repeatStartSource = index;
      repeatStartOutput = output.length;
      index += 1;
      continue;
    }

    if (source[index] === "," && repeatStartSource !== null) {
      throw new MmlError(index, "Repeat blocks cannot cross track separators");
    }

    const repeatEnd = readRepeatEnd(source, index);
    if (repeatEnd) {
      if (repeatStartSource === null || repeatStartOutput === null) {
        throw new MmlError(index, "Repeat end without repeat start");
      }
      const count = parseRepeatCount(repeatEnd.rawCount, index);
      const repeatedText = output.slice(repeatStartOutput);
      output += repeatedText.repeat(count - 1);
      assertExpandedLength(output.length, repeatStartSource);
      repeatStartSource = null;
      repeatStartOutput = null;
      index = repeatEnd.endIndex;
      continue;
    }

    output += source[index];
    assertExpandedLength(output.length, index);
  }

  if (repeatStartSource !== null) {
    throw new MmlError(repeatStartSource, "Repeat start is not closed");
  }

  return output;
}

function readRepeatEnd(source: string, index: number): { rawCount: string; endIndex: number } | null {
  if (source[index] !== ":") return null;
  const endIndex = source.indexOf("]", index + 1);
  if (endIndex === -1) return null;
  return {
    rawCount: source.slice(index + 1, endIndex).trim(),
    endIndex
  };
}

function parseRepeatCount(rawCount: string, position: number): number {
  if (rawCount === "") return 2;
  if (!/^\d+$/.test(rawCount)) {
    throw new MmlError(position, "Repeat count must be a positive integer");
  }
  const count = Number(rawCount);
  if (count < 1) {
    throw new MmlError(position, "Repeat count must be 1 or greater");
  }
  return count;
}

function assertExpandedLength(length: number, position: number): void {
  if (length > maxExpandedLength) {
    throw new MmlError(position, "Expanded MML is too long");
  }
}
