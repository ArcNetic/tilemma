import { significant, tokenize, type Token } from "./tokens.js";
import { colorCodeOfName, colorNameOfCode, isColorName, type Move, type Pos } from "./types.js";

export const MAX_COORD = 99;

export type ParsedLine =
  | { kind: "blank" }
  | { kind: "move"; move: Move }
  | { kind: "run"; name: string; args: number[] }
  | { kind: "invalid"; message: string; colStart: number; colEnd: number };

type Cursor = { tokens: Token[]; index: number; lineLength: number };

class LineError extends Error {
  constructor(
    message: string,
    readonly colStart: number,
    readonly colEnd: number,
  ) {
    super(message);
  }
}

const peek = (cur: Cursor): Token | undefined => cur.tokens[cur.index];

const fail = (cur: Cursor, message: string): never => {
  const token = peek(cur);
  throw new LineError(message, token?.start ?? cur.lineLength, token?.end ?? cur.lineLength + 1);
};

const expectSym = (cur: Cursor, sym: string, what: string): void => {
  const token = peek(cur);
  if (token?.kind !== "sym" || token.text !== sym) fail(cur, `Expected ${what}`);
  cur.index++;
};

const expectNum = (cur: Cursor, what: string): number => {
  const token = peek(cur);
  if (token?.kind !== "num") return fail(cur, `Expected ${what}`);
  const value = Number(token.text);
  if (value > MAX_COORD) fail(cur, `Number too large (max ${MAX_COORD})`);
  cur.index++;
  return value;
};

const expectCell = (cur: Cursor): Pos => {
  expectSym(cur, "(", "a cell like (row, col)");
  const r = expectNum(cur, "a row number");
  expectSym(cur, ",", "a comma between row and column");
  const c = expectNum(cur, "a column number");
  expectSym(cur, ")", "a closing parenthesis");
  return [r, c];
};

const expectEnd = (cur: Cursor): void => {
  if (peek(cur)) fail(cur, "Unexpected text at end of line");
};

const parseColor = (cur: Cursor) => {
  const token = peek(cur);
  if (token?.kind !== "ident" || !isColorName(token.text)) return fail(cur, "Expected a color name like red or blue");
  cur.index++;
  return colorCodeOfName(token.text);
};

const parseTokens = (cur: Cursor): ParsedLine => {
  const head = peek(cur);
  if (!head) return { kind: "blank" };
  if (head.kind !== "ident") return fail(cur, "A line must start with swap, paint, rotate or run");
  cur.index++;
  switch (head.text) {
    case "swap": {
      const a = expectCell(cur);
      const b = expectCell(cur);
      expectEnd(cur);
      return { kind: "move", move: { kind: "swap", a, b } };
    }
    case "paint": {
      const a = expectCell(cur);
      const color = parseColor(cur);
      expectEnd(cur);
      return { kind: "move", move: { kind: "paint", a, color } };
    }
    case "rotate": {
      const a = expectCell(cur);
      expectEnd(cur);
      return { kind: "move", move: { kind: "rotate", a } };
    }
    case "run": {
      const name = peek(cur);
      if (name?.kind !== "ident") return fail(cur, "Expected a helper name after run");
      cur.index++;
      const args: number[] = [];
      while (peek(cur)) args.push(expectNum(cur, "a number argument"));
      return { kind: "run", name: name.text, args };
    }
    default:
      cur.index--;
      return fail(cur, `Unknown move "${head.text}". Use swap, paint, rotate or run`);
  }
};

export const parseProofLine = (line: string): ParsedLine => {
  const tokens = tokenize(line);
  const bad = tokens.find((t) => t.kind === "bad");
  if (bad) return { kind: "invalid", message: `Unexpected character "${bad.text}"`, colStart: bad.start, colEnd: bad.end };
  try {
    return parseTokens({ tokens: significant(tokens), index: 0, lineLength: line.length });
  } catch (error) {
    if (error instanceof LineError) {
      return { kind: "invalid", message: error.message, colStart: error.colStart, colEnd: error.colEnd };
    }
    throw error;
  }
};

export const parseProof = (proof: string): ParsedLine[] => splitLines(proof).map(parseProofLine);

export const splitLines = (text: string): string[] => (text === "" ? [] : text.replace(/\r\n?/g, "\n").split("\n"));

export const formatPos = ([r, c]: Pos): string => `(${r}, ${c})`;

export const formatMove = (move: Move): string => {
  switch (move.kind) {
    case "swap":
      return `swap ${formatPos(move.a)} ${formatPos(move.b)}`;
    case "paint":
      return `paint ${formatPos(move.a)} ${colorNameOfCode(move.color)}`;
    case "rotate":
      return `rotate ${formatPos(move.a)}`;
  }
};

