import { tokenize, type MmlToken } from "./lexer";
import { MmlError } from "./types";

export type MmlCommand =
  | { kind: "tempo"; value: number; position: number }
  | { kind: "octave"; value: number; position: number }
  | { kind: "defaultLength"; value: number; position: number }
  | { kind: "volume"; value: number; position: number }
  | { kind: "gate"; value: number; position: number }
  | { kind: "timbre"; value: number; position: number }
  | { kind: "octaveShift"; delta: -1 | 1; position: number }
  | { kind: "note"; note: string; accidental: number; length: number | null; dotted: boolean; position: number }
  | { kind: "rest"; length: number | null; dotted: boolean; position: number };

export interface MmlTrack {
  commands: MmlCommand[];
}

export interface MmlAst {
  tracks: MmlTrack[];
}

const commandLetters = new Set(["T", "O", "L", "V", "Q"]);
const noteLetters = new Set(["C", "D", "E", "F", "G", "A", "B"]);

export function parseMml(source: string): MmlAst {
  const parser = new Parser(tokenize(source));
  return parser.parse();
}

class Parser {
  private index = 0;
  private readonly tracks: MmlTrack[] = [{ commands: [] }];

  constructor(private readonly tokens: MmlToken[]) {}

  parse(): MmlAst {
    while (!this.isEnd()) {
      const token = this.peek();

      if (token.value === ",") {
        this.index += 1;
        this.tracks.push({ commands: [] });
        continue;
      }

      this.currentTrack().commands.push(this.readCommand());
    }

    return { tracks: this.tracks };
  }

  private readCommand(): MmlCommand {
    const token = this.consume();
    const value = token.value;

    if (commandLetters.has(value)) {
      const number = this.readRequiredNumber(token.position, `${value} requires a number`);
      if (value === "T") {
        if (number <= 0) throw new MmlError(token.position, "Tempo must be greater than 0");
        return { kind: "tempo", value: number, position: token.position };
      }
      if (value === "O") {
        if (number < 0 || number > 9) throw new MmlError(token.position, "Octave must be 0-9");
        return { kind: "octave", value: number, position: token.position };
      }
      if (value === "L") {
        if (number <= 0) throw new MmlError(token.position, "Default length must be greater than 0");
        return { kind: "defaultLength", value: number, position: token.position };
      }
      if (value === "V") {
        if (number < 0 || number > 15) throw new MmlError(token.position, "Volume must be 0-15");
        return { kind: "volume", value: number, position: token.position };
      }
      if (number < 1 || number > 8) throw new MmlError(token.position, "Gate time must be 1-8");
      return { kind: "gate", value: number, position: token.position };
    }

    if (value === "@") {
      const number = this.readRequiredNumber(token.position, "@ requires a number");
      if (number < 0 || number > 15) throw new MmlError(token.position, "Timbre must be 0-15");
      return { kind: "timbre", value: number, position: token.position };
    }

    if (value === "<" || value === ">") {
      return { kind: "octaveShift", delta: value === ">" ? 1 : -1, position: token.position };
    }

    if (noteLetters.has(value)) {
      return this.readNote(token);
    }

    if (value === "R") {
      return this.readRest(token);
    }

    throw new MmlError(token.position, `Unknown character "${token.value}"`);
  }

  private readNote(token: MmlToken): MmlCommand {
    let accidental = 0;
    const next = this.peekOrNull();
    if (next?.value === "#" || next?.value === "+") {
      accidental = 1;
      this.index += 1;
    } else if (next?.value === "-") {
      accidental = -1;
      this.index += 1;
    }

    const length = this.readOptionalNumber();
    const dotted = this.readOptionalDot();
    return { kind: "note", note: token.value, accidental, length, dotted, position: token.position };
  }

  private readRest(token: MmlToken): MmlCommand {
    const length = this.readOptionalNumber();
    const dotted = this.readOptionalDot();
    return { kind: "rest", length, dotted, position: token.position };
  }

  private readRequiredNumber(position: number, message: string): number {
    const value = this.readOptionalNumber();
    if (value === null) throw new MmlError(position, message);
    return value;
  }

  private readOptionalNumber(): number | null {
    let text = "";
    while (!this.isEnd() && /^\d$/.test(this.peek().value)) {
      text += this.consume().value;
    }
    return text === "" ? null : Number(text);
  }

  private readOptionalDot(): boolean {
    if (this.peekOrNull()?.value === ".") {
      this.index += 1;
      return true;
    }
    return false;
  }

  private currentTrack(): MmlTrack {
    return this.tracks[this.tracks.length - 1];
  }

  private peek(): MmlToken {
    return this.tokens[this.index];
  }

  private peekOrNull(): MmlToken | null {
    return this.isEnd() ? null : this.peek();
  }

  private consume(): MmlToken {
    const token = this.peek();
    this.index += 1;
    return token;
  }

  private isEnd(): boolean {
    return this.index >= this.tokens.length;
  }
}
