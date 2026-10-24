import {
  colorCodeOfName,
  isColorName,
  parseProofLine,
  significant,
  splitLines,
  tokenize,
  type ColorCode,
  type Level,
  type MoveKind,
  type Token,
} from "@pp/engine";
import { diagnostic, type Diagnostic } from "./diagnostics.js";

export const LIMITS = {
  maxLines: 200,
  maxLineLength: 120,
  maxHelpers: 8,
  maxIdentLength: 24,
  maxNumber: 99,
} as const;

const RESERVED_NAMES = new Set([
  "swap", "paint", "rotate", "run", "def", "fun", "let", "in", "if", "then", "else", "match", "with", "do", "by",
  "have", "show", "from", "theorem", "lemma", "instance", "structure", "class", "inductive", "namespace", "section",
  "end", "where", "at", "open", "import", "set_option", "sorry", "admit", "decide", "native_decide", "unsafe",
  "partial", "macro", "syntax", "elab", "initialize", "deriving", "mutual", "private", "protected", "noncomputable",
  "step", "legal", "perform", "applyAll", "explainIllegal", "firstIssue", "flagCells", "isOutside", "isLocked",
  "isFixedDirection", "samePos", "updateNth", "colorNames", "maxSide", "maxHelperMoves", "stateJson", "boardJson",
  "issueJson", "posJson", "jsonArray", "decodeBoard", "decodeMove", "decodeMoves", "decodeNat", "decodeCell",
  "decodeList", "decodeOption", "decodeBool", "decodeColor", "decodeDir", "decodePos", "decodeFailure",
  "readPuzzleGoal", "cellPos", "colorOf", "advance", "runMove", "walkMoves", "helperCall", "runHelper", "puzzle",
  "red", "green", "blue", "yellow", "purple", "orange", "white", "black",
  "true", "false", "none", "some", "id", "fst", "snd",
]);

const ALLOWED_FUNCTIONS = new Set(["List.replicate", "List.map", "List.range", "List.flatten", "Move.swap", "Move.paint", "Move.rotate"]);

const DOT_CONSTRUCTORS = new Set(["swap", "paint", "rotate"]);

const NAME_PATTERN = /^[a-z][A-Za-z0-9_]*$/;

const CONTROL_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

const controlIndex = (text: string): number =>
  Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)).findIndex((code) =>
    CONTROL_RANGES.some(([lo, hi]) => code >= lo && code <= hi),
  );

export type HelperDef = { name: string; params: string[]; line: number };

export type SanitizeResult =
  | { ok: true; helperDefs: HelperDef[]; proofMoveLines: number[] }
  | { ok: false; diagnostics: Diagnostic[] };

type Pane = "proof" | "helpers";

type PlacedToken = Token & { line: number };

const lineDiagnostics = (pane: Pane, lines: string[]): Diagnostic[] => {
  const out: Diagnostic[] = [];
  if (lines.length > LIMITS.maxLines) {
    out.push(diagnostic(pane, LIMITS.maxLines + 1, 0, 1, "TOO_LONG", `At most ${LIMITS.maxLines} lines are allowed`));
  }
  lines.forEach((text, index) => {
    const line = index + 1;
    const tab = text.indexOf("\t");
    if (tab >= 0) out.push(diagnostic(pane, line, tab, tab + 1, "TAB", "Tabs are not allowed. Use spaces"));
    const control = controlIndex(text);
    if (control >= 0) out.push(diagnostic(pane, line, control, control + 1, "BAD_CHARACTER", "Control characters are not allowed"));
    if (text.length > LIMITS.maxLineLength) {
      out.push(diagnostic(pane, line, LIMITS.maxLineLength, text.length, "LINE_TOO_LONG", `Lines are limited to ${LIMITS.maxLineLength} characters`));
    }
  });
  return out;
};

const badTokenDiagnostics = (pane: Pane, lines: string[]): Diagnostic[] =>
  lines.flatMap((text, index) => {
    const bad = tokenize(text).find((t) => t.kind === "bad");
    if (!bad) return [];
    const message = bad.text === "#" ? "Commands starting with # are not allowed" : `Character "${bad.text}" is not allowed here`;
    return [diagnostic(pane, index + 1, bad.start, bad.end, "FORBIDDEN_TOKEN", message)];
  });

const validIdentifier = (pane: Pane, token: PlacedToken, taken: Set<string>): Diagnostic | undefined => {
  const { text } = token;
  const at = (code: string, message: string) => diagnostic(pane, token.line, token.start, token.end, code, message);
  if (text.length > LIMITS.maxIdentLength) return at("NAME_TOO_LONG", `Names are limited to ${LIMITS.maxIdentLength} characters`);
  if (!NAME_PATTERN.test(text)) return at("BAD_NAME", "Names must start with a lowercase letter and use only letters, digits and underscores");
  if (RESERVED_NAMES.has(text)) return at("RESERVED_NAME", `"${text}" is reserved and cannot be used as a name`);
  if (taken.has(text)) return at("DUPLICATE_NAME", `"${text}" is already defined`);
  return undefined;
};

const splitStatements = (lines: string[]): { startLine: number; tokens: PlacedToken[] }[] => {
  const statements: { startLine: number; tokens: PlacedToken[] }[] = [];
  lines.forEach((text, index) => {
    const tokens = significant(tokenize(text)).map((t) => ({ ...t, line: index + 1 }));
    if (tokens.length === 0) return;
    const continuation = /^\s/.test(text);
    const last = statements[statements.length - 1];
    if (continuation && last) last.tokens.push(...tokens);
    else statements.push({ startLine: index + 1, tokens });
  });
  return statements;
};

class Reader {
  index = 0;
  constructor(
    readonly tokens: PlacedToken[],
    readonly pane: Pane,
  ) {}

  peek(): PlacedToken | undefined {
    return this.tokens[this.index];
  }

  next(): PlacedToken | undefined {
    return this.tokens[this.index++];
  }

  last(): PlacedToken {
    return this.tokens[Math.min(this.index, this.tokens.length - 1)]!;
  }

  fail(code: string, message: string, token = this.peek() ?? this.tokens[this.tokens.length - 1]!): Diagnostic {
    return diagnostic(this.pane, token.line, token.start, token.end, code, message);
  }
}

type HeaderResult = { def: HelperDef; scope: Set<string> } | Diagnostic;

const isDiagnostic = (x: unknown): x is Diagnostic => typeof x === "object" && x !== null && "code" in x && "pane" in x;

const expectText = (r: Reader, text: string, what: string): Diagnostic | undefined => {
  const t = r.peek();
  if (!t || t.text !== text) return r.fail("SYNTAX", `Expected ${what}`);
  r.next();
  return undefined;
};

const readHeader = (r: Reader, defined: Set<string>, startLine: number): HeaderResult => {
  const head = r.next();
  if (!head || head.text !== "def") return r.fail("NOT_A_DEF", "Helpers must be written as: def name (params : Nat) : List Move := ...", head);
  const nameToken = r.next();
  if (!nameToken || nameToken.kind !== "ident") return r.fail("SYNTAX", "Expected a helper name after def", nameToken ?? head);
  const nameProblem = validIdentifier(r.pane, nameToken, defined);
  if (nameProblem) return nameProblem;
  const params: string[] = [];
  while (r.peek()?.text === "(") {
    r.next();
    const group: PlacedToken[] = [];
    while (r.peek()?.kind === "ident") group.push(r.next()!);
    if (group.length === 0) return r.fail("SYNTAX", "Expected a parameter name");
    for (const p of group) {
      const problem = validIdentifier(r.pane, p, new Set([...defined, nameToken.text, ...params]));
      if (problem) return problem;
      params.push(p.text);
    }
    const colon = expectText(r, ":", "a colon after the parameter names");
    if (colon) return colon;
    const nat = r.next();
    if (nat?.text !== "Nat") return r.fail("SYNTAX", "Parameters must have type Nat", nat ?? r.last());
    const close = expectText(r, ")", "a closing parenthesis");
    if (close) return close;
  }
  for (const [text, what] of [[":", "a colon before the return type"], ["List", "the return type List Move"], ["Move", "the return type List Move"], [":=", ":= before the definition body"]] as const) {
    const problem = expectText(r, text, what);
    if (problem) return problem;
  }
  return { def: { name: nameToken.text, params, line: startLine }, scope: new Set(params) };
};

type TermContext = {
  scope: Set<string>;
  helpers: Map<string, HelperDef>;
  level: Level;
};

const unauthorizedMove = (kind: MoveKind, level: Level): boolean => !level.moves.includes(kind);

const colorOutsidePalette = (name: string, level: Level): boolean => {
  if (!isColorName(name)) return false;
  const code: ColorCode = colorCodeOfName(name);
  return !level.palette.includes(code);
};

const forbidden = (r: Reader, token: PlacedToken, message: string): Diagnostic => r.fail("FORBIDDEN", message, token);

const readTerm = (r: Reader, ctx: TermContext): Diagnostic | undefined => {
  if (!r.peek()) return r.fail("SYNTAX", "Expected a definition body after :=", r.last());
  const locals = new Set(ctx.scope);
  let depth = 0;
  let previous: PlacedToken | undefined;
  while (r.peek()) {
    const t = r.next()!;
    const afterDot = previous?.text === "." && previous.kind === "sym";
    if (t.kind === "num") {
      if (Number(t.text) > LIMITS.maxNumber) return r.fail("NUMBER_TOO_LARGE", `Numbers are limited to ${LIMITS.maxNumber}`, t);
    } else if (t.kind === "sym") {
      if (t.text === "(" || t.text === "[") depth++;
      else if (t.text === ")" || t.text === "]") depth--;
      else if (![",", ".", "+", "-", "*", "++", "=>"].includes(t.text)) return r.fail("FORBIDDEN_TOKEN", `"${t.text}" is not allowed in a helper body`, t);
      if (depth < 0) return r.fail("SYNTAX", "Unbalanced closing bracket", t);
      if (t.text === ".") {
        const following = r.peek();
        if (!following || following.kind !== "ident" || (!DOT_CONSTRUCTORS.has(following.text) && !isColorName(following.text))) {
          return r.fail("FORBIDDEN_TOKEN", "A leading dot must be followed by swap, paint, rotate or a color", following ?? t);
        }
      }
    } else if (t.kind === "ident") {
      const problem = checkTermIdent(r, t, afterDot, locals, ctx);
      if (problem) return problem;
      if (t.text === "fun") {
        const binders: PlacedToken[] = [];
        while (r.peek()?.kind === "ident") binders.push(r.next()!);
        if (binders.length === 0) return r.fail("SYNTAX", "Expected a name after fun", t);
        for (const b of binders) {
          const bad = validIdentifier(r.pane, b, new Set());
          if (bad) return bad;
          locals.add(b.text);
        }
        if (r.peek()?.text !== "=>") return r.fail("SYNTAX", "Expected => after the function parameters", r.peek() ?? t);
      }
    } else {
      return r.fail("FORBIDDEN_TOKEN", "Unexpected token in helper body", t);
    }
    previous = t;
  }
  return depth === 0 ? undefined : r.fail("SYNTAX", "Unbalanced opening bracket", r.last());
};

const checkTermIdent = (r: Reader, t: PlacedToken, afterDot: boolean, locals: Set<string>, ctx: TermContext): Diagnostic | undefined => {
  const { text } = t;
  if (text === "fun") return undefined;
  if (afterDot) {
    if (DOT_CONSTRUCTORS.has(text) && unauthorizedMove(text as MoveKind, ctx.level)) return forbidden(r, t, `The ${text} move is not available on this level`);
    return colorOutsidePalette(text, ctx.level) ? forbidden(r, t, `${text} is not in this level's palette`) : undefined;
  }
  if (isColorName(text)) return colorOutsidePalette(text, ctx.level) ? forbidden(r, t, `${text} is not in this level's palette`) : undefined;
  if (ALLOWED_FUNCTIONS.has(text)) {
    const kind = text.startsWith("Move.") ? (text.slice(5) as MoveKind) : undefined;
    return kind && unauthorizedMove(kind, ctx.level) ? forbidden(r, t, `The ${kind} move is not available on this level`) : undefined;
  }
  if (locals.has(text) || ctx.helpers.has(text)) return undefined;
  if (text === "fun" || RESERVED_NAMES.has(text)) return r.fail("FORBIDDEN_TOKEN", `"${text}" is not allowed in a helper body`, t);
  return r.fail("UNKNOWN_NAME", `"${text}" is not defined here`, t);
};

const sanitizeHelpers = (helpers: string, level: Level): { defs: HelperDef[]; diagnostics: Diagnostic[] } => {
  const lines = splitLines(helpers);
  if (lines.every((l) => significant(tokenize(l)).length === 0)) return { defs: [], diagnostics: [] };
  if (level.helpers === "none") {
    const first = lines.findIndex((l) => significant(tokenize(l)).length > 0);
    return { defs: [], diagnostics: [diagnostic("helpers", first + 1, 0, lines[first]!.length, "FORBIDDEN", "Helpers are not available on this level")] };
  }
  const preliminary = [...lineDiagnostics("helpers", lines), ...badTokenDiagnostics("helpers", lines)];
  if (preliminary.length > 0) return { defs: [], diagnostics: preliminary };
  const statements = splitStatements(lines);
  const helperMap = new Map<string, HelperDef>();
  if (statements.length > LIMITS.maxHelpers) {
    const extra = statements[LIMITS.maxHelpers]!;
    return { defs: [], diagnostics: [diagnostic("helpers", extra.startLine, 0, 3, "TOO_MANY_HELPERS", `At most ${LIMITS.maxHelpers} helpers are allowed`)] };
  }
  for (const statement of statements) {
    const startIsIndented = /^\s/.test(lines[statement.startLine - 1] ?? "");
    if (startIsIndented) {
      return { defs: [], diagnostics: [diagnostic("helpers", statement.startLine, 0, 1, "SYNTAX", "A definition must start at the beginning of the line")] };
    }
    const reader = new Reader(statement.tokens, "helpers");
    const header = readHeader(reader, new Set(helperMap.keys()), statement.startLine);
    if (isDiagnostic(header)) return { defs: [], diagnostics: [header] };
    if (level.helpers === "simple" && header.def.params.length > 0) {
      const t = statement.tokens[2]!;
      return { defs: [], diagnostics: [diagnostic("helpers", t.line, t.start, t.end, "FORBIDDEN", "Helpers on this level cannot take parameters")] };
    }
    const problem = readTerm(reader, { scope: header.scope, helpers: helperMap, level });
    if (problem) return { defs: [], diagnostics: [problem] };
    helperMap.set(header.def.name, header.def);
  }
  return { defs: [...helperMap.values()], diagnostics: [] };
};

const sanitizeProof = (proof: string, level: Level, helpers: Map<string, HelperDef>): { moveLines: number[]; diagnostics: Diagnostic[] } => {
  const lines = splitLines(proof);
  const preliminary = [...lineDiagnostics("proof", lines), ...badTokenDiagnostics("proof", lines)];
  if (preliminary.length > 0) return { moveLines: [], diagnostics: preliminary };
  const diagnostics: Diagnostic[] = [];
  const moveLines: number[] = [];
  lines.forEach((text, index) => {
    const line = index + 1;
    const parsed = parseProofLine(text);
    if (parsed.kind === "blank") return;
    if (parsed.kind === "invalid") {
      diagnostics.push(diagnostic("proof", line, parsed.colStart, parsed.colEnd, "SYNTAX", parsed.message));
      return;
    }
    moveLines.push(line);
    const span = significant(tokenize(text));
    const start = span[0]!.start;
    const end = span[span.length - 1]!.end;
    if (parsed.kind === "move") {
      if (unauthorizedMove(parsed.move.kind, level)) {
        diagnostics.push(diagnostic("proof", line, start, span[0]!.end, "FORBIDDEN", `The ${parsed.move.kind} move is not available on this level`));
      } else if (parsed.move.kind === "paint" && !level.palette.includes(parsed.move.color)) {
        const colorToken = span[span.length - 1]!;
        diagnostics.push(diagnostic("proof", line, colorToken.start, colorToken.end, "FORBIDDEN", `${colorToken.text} is not in this level's palette`));
      }
      return;
    }
    if (level.helpers === "none") {
      diagnostics.push(diagnostic("proof", line, start, span[0]!.end, "FORBIDDEN", "Helpers are not available on this level"));
      return;
    }
    const def = helpers.get(parsed.name);
    if (!def) {
      const nameToken = span[1]!;
      diagnostics.push(diagnostic("proof", line, nameToken.start, nameToken.end, "UNDEFINED_HELPER", `No helper named "${parsed.name}" is defined`));
    } else if (def.params.length !== parsed.args.length) {
      diagnostics.push(diagnostic("proof", line, start, end, "WRONG_ARITY", `${def.name} takes ${def.params.length} argument${def.params.length === 1 ? "" : "s"} but got ${parsed.args.length}`));
    }
  });
  return { moveLines, diagnostics };
};

export const sanitize = (helpers: string, proof: string, level: Level): SanitizeResult => {
  const helperResult = sanitizeHelpers(helpers, level);
  if (helperResult.diagnostics.length > 0) return { ok: false, diagnostics: helperResult.diagnostics };
  const helperMap = new Map(helperResult.defs.map((d) => [d.name, d]));
  const proofResult = sanitizeProof(proof, level, helperMap);
  if (proofResult.diagnostics.length > 0) return { ok: false, diagnostics: proofResult.diagnostics };
  return { ok: true, helperDefs: helperResult.defs, proofMoveLines: proofResult.moveLines };
};
