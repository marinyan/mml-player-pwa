export interface MmlToken {
  value: string;
  position: number;
}

export function tokenize(source: string): MmlToken[] {
  const tokens: MmlToken[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (/\s/.test(char)) {
      continue;
    }
    tokens.push({ value: char.toUpperCase(), position: index });
  }

  return tokens;
}
