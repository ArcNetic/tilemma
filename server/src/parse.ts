import { PROOF_INDENT, reasonMessage, type CodeBoard, type LeanFile, type ParsedLine } from "@pp/engine";
import { z } from "zod";
import { diagnostic, type Diagnostic, type LineState, type Status } from "./diagnostics.js";
import { cleanLeanMessage } from "./messages.js";

const LeanMessageSchema = z.object({
  severity: z.enum(["information", "warning", "error"]),
  kind: z.string().optional(),
  data: z.string(),
  pos: z.object({ line: z.number().int(), column: z.number().int() }),
  endPos: z.object({ line: z.number().int(), column: z.number().int() }).nullable().optional(),
});

export type LeanMessage = z.infer<typeof LeanMessageSchema>;

export type ParseContext = {
  start: CodeBoard;
  file: LeanFile;
  proofText: string[];
  helperText: string[];
  parsedProof: ParsedLine[];
  theorem: string;
};

export type ParsedCheck = {
  status: Status;
  states: CodeBoard[];
  lineStates: LineState[];
  diagnostics: Diagnostic[];
  axiomsOk: boolean | null;
};

type Located = { pane: "proof" | "helpers"; line: number; colStart: number; colEnd: number };

const BOARD_PREFIX = "PP_BOARD ";
const ILLEGAL_PREFIX = "PP_ILLEGAL ";
const FORBIDDEN_AXIOMS = ["sorryAx", "Lean.ofReduceBool", "Lean.ofReduceNat"];

export const parseMessages = (lines: readonly string[]): LeanMessage[] =>
  lines.flatMap((line) => {
    try {
      const parsed = LeanMessageSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });

const parsePayload = (data: string, prefix: string): unknown => {
  const joined = data.slice(prefix.length).replace(/\s*\n\s*/g, "");
  return JSON.parse(joined);
};

const BoardPayload = z.object({
  board: z.array(z.array(z.string())),
  substeps: z.array(z.array(z.array(z.string()))).default([]),
});

const IllegalPayload = z.object({
  reason: z.string(),
  cells: z.array(z.tuple([z.number().int(), z.number().int()])),
  substep: z.number().int().nullable(),
  substeps: z.array(z.array(z.array(z.string()))).default([]),
});

const locate = (msg: LeanMessage, ctx: ParseContext): Located | undefined => {
  const { file } = ctx;
  const line = msg.pos.line;
  const sameLineEnd = msg.endPos && msg.endPos.line === line ? msg.endPos.column : undefined;
  if (line >= file.proofStartLine && line < file.proofStartLine + file.proofLineCount) {
    const index = line - file.proofStartLine;
    const text = ctx.proofText[index] ?? "";
    const shift = (file.proofIndents[index] ?? 0) - PROOF_INDENT;
    const colStart = Math.max(0, msg.pos.column + shift);
    const colEnd = sameLineEnd === undefined ? text.length : Math.max(colStart + 1, sameLineEnd + shift);
    return { pane: "proof", line: index + 1, colStart, colEnd };
  }
  if (line >= file.helpersStartLine && line < file.helpersStartLine + file.helpersLineCount) {
    const index = line - file.helpersStartLine;
    const text = ctx.helperText[index] ?? "";
    const colEnd = sameLineEnd === undefined ? text.length : Math.max(msg.pos.column + 1, sameLineEnd);
    return { pane: "helpers", line: index + 1, colStart: msg.pos.column, colEnd };
  }
  return undefined;
};

const isMoveLine = (parsed: ParsedLine | undefined): boolean => parsed?.kind === "move" || parsed?.kind === "run";

const lastMoveLine = (ctx: ParseContext): number => {
  for (let i = ctx.parsedProof.length - 1; i >= 0; i--) if (isMoveLine(ctx.parsedProof[i])) return i + 1;
  return 1;
};

const lineWidth = (ctx: ParseContext, line: number): number => ctx.proofText[line - 1]?.length ?? 0;

const buildStates = (
  boards: Map<number, { board: CodeBoard; substeps: CodeBoard[] }>,
  ctx: ParseContext,
  failure?: { line: number; substeps: CodeBoard[] },
): { states: CodeBoard[]; lineStates: LineState[] } => {
  const states: CodeBoard[] = [ctx.start];
  const lineStates: LineState[] = [];
  for (let i = 0; i < ctx.parsedProof.length; i++) {
    const line = i + 1;
    const parsed = ctx.parsedProof[i];
    if (isMoveLine(parsed)) {
      const executed = boards.get(line);
      if (executed) {
        states.push(executed.board);
        const entry: LineState = { line, stateIndex: states.length - 1 };
        if (parsed?.kind === "run") entry.substeps = executed.substeps;
        lineStates.push(entry);
        continue;
      }
      if (failure && failure.line === line && failure.substeps.length > 0) {
        lineStates.push({ line, stateIndex: states.length - 1, substeps: failure.substeps });
      }
      break;
    }
    lineStates.push({ line, stateIndex: states.length - 1 });
  }
  return { states, lineStates };
};

const collectBoards = (messages: readonly LeanMessage[], ctx: ParseContext) => {
  const boards = new Map<number, { board: CodeBoard; substeps: CodeBoard[] }>();
  for (const msg of messages) {
    if (msg.severity !== "information" || !msg.data.startsWith(BOARD_PREFIX)) continue;
    const where = locate(msg, ctx);
    if (where?.pane !== "proof") continue;
    try {
      const payload = BoardPayload.parse(parsePayload(msg.data, BOARD_PREFIX));
      boards.set(where.line, { board: payload.board, substeps: payload.substeps.length > 0 ? payload.substeps : [] });
    } catch {
      continue;
    }
  }
  return boards;
};

const axiomsVerdict = (messages: readonly LeanMessage[], theorem: string): boolean | null => {
  for (const msg of messages) {
    if (msg.severity !== "information") continue;
    if (msg.data.includes(`'${theorem}' does not depend on any axioms`)) return true;
    const match = new RegExp(`^'${theorem}' depends on axioms: \\[(.*)\\]\\s*$`, "s").exec(msg.data);
    if (match) {
      const names = match[1]!.split(",").map((n) => n.trim());
      return !names.some((n) => FORBIDDEN_AXIOMS.includes(n));
    }
  }
  return null;
};

const fallbackLocation = (ctx: ParseContext): Located => {
  const line = lastMoveLine(ctx);
  return { pane: "proof", line, colStart: 0, colEnd: lineWidth(ctx, line) };
};

const illegalDiagnostic = (msg: LeanMessage, where: Located, ctx: ParseContext) => {
  const payload = IllegalPayload.parse(parsePayload(msg.data, ILLEGAL_PREFIX));
  const parsedLine = ctx.parsedProof[where.line - 1];
  const prefix =
    payload.substep !== null && parsedLine?.kind === "run"
      ? `Step ${payload.substep + 1} of helper ${parsedLine.name}: `
      : "";
  return {
    payload,
    diag: diagnostic(where.pane, where.line, where.colStart, where.colEnd, payload.reason, prefix + reasonMessage(payload.reason, payload.cells), {
      cells: payload.cells,
      ...(payload.substep !== null ? { substep: payload.substep } : {}),
    }),
  };
};

const INTERNAL_PREFIXES = ["PP_BAD_GOAL", "PP_DECODE"];

export const parseLeanOutput = (lines: readonly string[], ctx: ParseContext): ParsedCheck => {
  const messages = parseMessages(lines);
  const boards = collectBoards(messages, ctx);
  const errors = messages.filter((m) => m.severity === "error");
  const axiomsOk = axiomsVerdict(messages, ctx.theorem);
  const first = errors[0];

  if (!first) {
    const { states, lineStates } = buildStates(boards, ctx);
    if (axiomsOk === true) return { status: "SOLVED", states, lineStates, diagnostics: [], axiomsOk };
    const message = axiomsOk === false ? "The proof depends on a forbidden axiom" : "Lean produced no verdict for the proof";
    return { status: "INTERNAL_ERROR", states, lineStates, diagnostics: [diagnostic("proof", 1, 0, 1, "NO_VERDICT", message)], axiomsOk };
  }

  const where = locate(first, ctx);

  if (first.data.startsWith(ILLEGAL_PREFIX) && where) {
    try {
      const { payload, diag } = illegalDiagnostic(first, where, ctx);
      const failure = where.pane === "proof" ? { line: where.line, substeps: payload.substeps } : undefined;
      const { states, lineStates } = buildStates(boards, ctx, failure);
      return { status: "ILLEGAL", states, lineStates, diagnostics: [diag], axiomsOk: null };
    } catch {
      const { states, lineStates } = buildStates(boards, ctx);
      return { status: "INTERNAL_ERROR", states, lineStates, diagnostics: [diagnostic("proof", where.line, where.colStart, where.colEnd, "BAD_PAYLOAD", "Could not read the checker's error report")], axiomsOk: null };
    }
  }

  const { states, lineStates } = buildStates(boards, ctx);

  if (first.data.startsWith("PP_EXTRA_MOVES")) {
    const at = where ?? fallbackLocation(ctx);
    return {
      status: "EXTRA_MOVES",
      states,
      lineStates,
      diagnostics: [diagnostic(at.pane, at.line, at.colStart, at.colEnd, "EXTRA_MOVES", "The board already matches the target. Remove this move.")],
      axiomsOk: null,
    };
  }

  if (first.kind === "Tactic.unsolvedGoals" || first.data.startsWith("unsolved goals")) {
    const at = fallbackLocation(ctx);
    return {
      status: "INCOMPLETE",
      states,
      lineStates,
      diagnostics: [diagnostic(at.pane, at.line, at.colStart, at.colEnd, "INCOMPLETE", "The board does not match the target yet.")],
      axiomsOk: null,
    };
  }

  const internal = INTERNAL_PREFIXES.some((p) => first.data.startsWith(p));
  const at = where ?? fallbackLocation(ctx);
  return {
    status: internal ? "INTERNAL_ERROR" : "SYNTAX_ERROR",
    states,
    lineStates,
    diagnostics: [diagnostic(at.pane, at.line, at.colStart, at.colEnd, "LEAN_ERROR", cleanLeanMessage(first.data))],
    axiomsOk: null,
  };
};
