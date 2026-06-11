import { tokenize, type MmlToken } from "./lexer";
import { MmlError } from "./types";

export type MmlCommand =
  | { kind: "tempo"; value: number; position: number }
  | { kind: "octave"; value: number; position: number }
  | { kind: "defaultLength"; value: number; position: number }
  | { kind: "volume"; value: number; position: number }
  | { kind: "dynamicChange"; step: -1 | 1; position: number }
  | { kind: "pan"; value: number; position: number }
  | { kind: "gate"; value: number; position: number }
  | { kind: "timbre"; value: number; position: number }
  | { kind: "gmTimbre"; value: number; position: number }
  | { kind: "connect"; position: number }
  | { kind: "timeSignature"; numerator: number; denominator: number; position: number }
  | { kind: "measureBoundary"; position: number }
  | { kind: "tuplet"; commands: MmlCommand[]; length: number; dotted: boolean; position: number }
  | { kind: "chord"; notes: ChordNote[]; length: number | null; dotted: boolean; position: number }
  | { kind: "octaveShift"; delta: -1 | 1; position: number }
  | { kind: "note"; note: string; accidental: number; length: number | null; dotted: boolean; position: number }
  | { kind: "rest"; length: number | null; dotted: boolean; position: number };

export interface MmlTrack {
  commands: MmlCommand[];
}

export interface ChordNote {
  note: string;
  accidental: number;
  octaveDelta: number;
}

export interface MmlAst {
  tracks: MmlTrack[];
}

const commandLetters = new Set(["T", "O", "L", "V", "P", "Q"]);
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

    if (value === "#") {
      return this.readDirective(token);
    }

    if (value === "{") {
      return this.readTuplet(token);
    }

    if (value === "(") {
      return this.readChord(token);
    }

    if (value === "C" && this.matchesLiteral("RESC.")) {
      this.readLiteral("RESC.", token.position, "Cresc. requires a trailing dot");
      return { kind: "dynamicChange", step: 1, position: token.position };
    }

    if (value === "D" && this.matchesLiteral("IM.")) {
      this.readLiteral("IM.", token.position, "Dim. requires a trailing dot");
      return { kind: "dynamicChange", step: -1, position: token.position };
    }

    if (commandLetters.has(value)) {
      if (value === "P") {
        const pan = this.readRequiredPan(token.position);
        return { kind: "pan", value: pan, position: token.position };
      }

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
      if (this.peekOrNull()?.value === "G") {
        this.index += 1;
        const m = this.consumeOrError(token.position, "@gm requires a program number");
        if (m.value !== "M") throw new MmlError(m.position, "@gm requires a program number");
        const number = this.readRequiredNumber(token.position, "@gm requires a program number");
        if (number < 1 || number > 128) throw new MmlError(token.position, "GM timbre must be 1-128");
        return { kind: "gmTimbre", value: number, position: token.position };
      }
      const number = this.readRequiredNumber(token.position, "@ requires a number");
      if (number < 0 || number > 63) throw new MmlError(token.position, "Timbre must be 0-63");
      return { kind: "timbre", value: number, position: token.position };
    }

    if (value === "&") {
      return { kind: "connect", position: token.position };
    }

    if (value === "|") {
      return { kind: "measureBoundary", position: token.position };
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

  private readDirective(token: MmlToken): MmlCommand {
    this.readLiteral("TIME", token.position, "Unknown directive");
    const numerator = this.readRequiredNumber(token.position, "#TIME requires a numerator");
    const slash = this.consumeOrError(token.position, "#TIME requires n/d");
    if (slash.value !== "/") {
      throw new MmlError(slash.position, "#TIME requires n/d");
    }
    const denominator = this.readRequiredNumber(token.position, "#TIME requires a denominator");

    if (numerator <= 0) throw new MmlError(token.position, "#TIME numerator must be greater than 0");
    if (denominator <= 0) throw new MmlError(token.position, "#TIME denominator must be greater than 0");
    if (![1, 2, 4, 8, 16].includes(denominator)) {
      throw new MmlError(token.position, "#TIME denominator must be one of 1, 2, 4, 8, 16");
    }

    return { kind: "timeSignature", numerator, denominator, position: token.position };
  }

  private readTuplet(token: MmlToken): MmlCommand {
    const commands: MmlCommand[] = [];
    while (this.peekOrNull()?.value !== "}") {
      if (this.isEnd()) throw new MmlError(token.position, "Tuplet requires }");
      const command = this.readCommand();
      if (command.kind === "tuplet") throw new MmlError(command.position, "Nested tuplets are not supported");
      if (["tempo", "timeSignature", "measureBoundary"].includes(command.kind)) {
        throw new MmlError(command.position, "Tuplets cannot contain tempo, time signature, or measure boundary commands");
      }
      commands.push(command);
    }
    this.index += 1;
    const length = this.readRequiredNumber(token.position, "Tuplet requires a total length after }");
    if (length <= 0) throw new MmlError(token.position, "Tuplet length must be greater than 0");
    const dotted = this.readOptionalDot();
    const timedCount = commands.filter((command) =>
      command.kind === "note" || command.kind === "rest" || command.kind === "chord"
    ).length;
    if (timedCount === 0) throw new MmlError(token.position, "Tuplet requires at least one note or rest");
    return { kind: "tuplet", commands, length, dotted, position: token.position };
  }

  private readChord(token: MmlToken): MmlCommand {
    const notes: ChordNote[] = [];
    let octaveDelta = 0;

    while (this.peekOrNull()?.value !== ")") {
      if (this.isEnd()) throw new MmlError(token.position, "Chord requires )");
      const item = this.consume();
      if (item.value === "<" || item.value === ">") {
        octaveDelta += item.value === ">" ? 1 : -1;
        continue;
      }
      if (!noteLetters.has(item.value)) {
        throw new MmlError(item.position, "Chords can contain only notes, accidentals, and octave shifts");
      }

      let accidental = 0;
      const next = this.peekOrNull();
      if (next?.value === "#" || next?.value === "+") {
        accidental = 1;
        this.index += 1;
      } else if (next?.value === "-") {
        accidental = -1;
        this.index += 1;
      }
      notes.push({ note: item.value, accidental, octaveDelta });
    }

    this.index += 1;
    if (notes.length === 0) throw new MmlError(token.position, "Chord requires at least one note");
    const length = this.readOptionalNumber();
    if (length !== null && length <= 0) throw new MmlError(token.position, "Chord length must be greater than 0");
    const dotted = this.readOptionalDot();
    return { kind: "chord", notes, length, dotted, position: token.position };
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

  private readRequiredPan(position: number): number {
    let text = "";

    if (this.peekOrNull()?.value === "+" || this.peekOrNull()?.value === "-") {
      text += this.consume().value;
    }

    const integerDigits = this.readDigits();
    text += integerDigits;

    if (this.peekOrNull()?.value === ".") {
      text += this.consume().value;
      const fractionDigits = this.readDigits();
      if (fractionDigits === "") {
        throw new MmlError(position, "Pan must be -1.0 to +1.0");
      }
      text += fractionDigits;
    }

    if (integerDigits === "" || text === "+" || text === "-") {
      throw new MmlError(position, "P requires a pan value");
    }

    const pan = Number(text);
    if (!Number.isFinite(pan) || pan < -1 || pan > 1) {
      throw new MmlError(position, "Pan must be -1.0 to +1.0");
    }

    return Math.round((pan + 1) * 63.5);
  }

  private readLiteral(text: string, position: number, message: string): void {
    for (const expected of text) {
      const token = this.consumeOrError(position, message);
      if (token.value !== expected) {
        throw new MmlError(token.position, message);
      }
    }
  }

  private matchesLiteral(text: string): boolean {
    return [...text].every((expected, offset) => this.tokens[this.index + offset]?.value === expected);
  }

  private readOptionalNumber(): number | null {
    const text = this.readDigits();
    return text === "" ? null : Number(text);
  }

  private readDigits(): string {
    let text = "";
    while (!this.isEnd() && /^\d$/.test(this.peek().value)) {
      text += this.consume().value;
    }
    return text;
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

  private consumeOrError(position: number, message: string): MmlToken {
    if (this.isEnd()) throw new MmlError(position, message);
    return this.consume();
  }

  private isEnd(): boolean {
    return this.index >= this.tokens.length;
  }
}
