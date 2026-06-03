export interface MmlToken {
  value: string;
  position: number;
}

export function tokenize(source: string): MmlToken[] {
  const tokens: MmlToken[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (/\s/.test(char)) {
      continue;
    }
    tokens.push({ value: char.toUpperCase(), position: index });
  }

  return tokens;
}
