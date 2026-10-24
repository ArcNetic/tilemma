import { buildLeanFile, levelBoards, serializeBoard, splitLines, parseProofLine, type CodeBoard } from "@pp/engine";
import { cacheKey, LruCache } from "./cache.js";
import { diagnostic, type CheckRequest, type CheckResponse, type Diagnostic, type LineState, type Status } from "./diagnostics.js";
import type { LevelCatalog } from "./levels.js";
import { parseLeanOutput, type ParsedCheck } from "./parse.js";
import { Pool, PoolFull } from "./pool.js";
import type { LeanRunner } from "./runner.js";
import { sanitize } from "./sanitize.js";

const THEOREM = "puzzle";

export type CheckerDeps = {
  catalog: LevelCatalog;
  runner: LeanRunner;
  pool: Pool;
  cache: LruCache<{ result: ParsedCheck; leanMs: number }>;
  fingerprint: string;
  debugLean: boolean;
};

export type CheckOutcome = { kind: "unknown-level" } | { kind: "response"; response: CheckResponse };

const blankLineStates = (proof: string): LineState[] =>
  splitLines(proof).map((_, i) => ({ line: i + 1, stateIndex: 0 }));

const respond = (
  status: Status,
  start: CodeBoard,
  extra: Partial<CheckResponse> = {},
): CheckResponse => ({
  status,
  states: [start],
  lineStates: [],
  diagnostics: [],
  axiomsOk: null,
  leanMs: 0,
  cached: false,
  ...extra,
});

const hasMoveLines = (proof: string): boolean =>
  splitLines(proof).some((line) => {
    const parsed = parseProofLine(line);
    return parsed.kind === "move" || parsed.kind === "run";
  });

export const createChecker = (deps: CheckerDeps) => {
  const check = async (request: CheckRequest): Promise<CheckOutcome> => {
    const level = deps.catalog.byId(request.levelId);
    if (!level) return { kind: "unknown-level" };
    const boards = levelBoards(level);
    const start = serializeBoard(boards.start);

    const sanitized = sanitize(request.helpers, request.proof, level);
    if (!sanitized.ok) {
      const forbidden = sanitized.diagnostics.some((d) => d.code === "FORBIDDEN");
      return {
        kind: "response",
        response: respond(forbidden ? "FORBIDDEN" : "SYNTAX_ERROR", start, { diagnostics: sanitized.diagnostics }),
      };
    }

    if (!hasMoveLines(request.proof)) {
      return {
        kind: "response",
        response: respond("INCOMPLETE", start, { lineStates: blankLineStates(request.proof) }),
      };
    }

    const file = buildLeanFile(boards, request.helpers, request.proof, THEOREM);
    const generated = deps.debugLean ? { generatedLean: file.source } : {};
    const key = cacheKey([deps.fingerprint, request.levelId, request.helpers, request.proof]);

    const hit = deps.cache.get(key);
    if (hit) {
      return { kind: "response", response: { ...hit.result, leanMs: hit.leanMs, cached: true, ...generated } };
    }

    let outcome;
    try {
      outcome = await deps.pool.run(() => deps.runner.run(file.source));
    } catch (error) {
      if (error instanceof PoolFull) {
        return { kind: "response", response: respond("BUSY", start, { diagnostics: [busyDiagnostic()], ...generated }) };
      }
      throw error;
    }

    if (outcome.timedOut) {
      return { kind: "response", response: respond("TIMEOUT", start, { leanMs: outcome.ms, diagnostics: [timeoutDiagnostic()], ...generated }) };
    }
    if (outcome.outputTruncated || outcome.lines.length === 0) {
      return {
        kind: "response",
        response: respond("INTERNAL_ERROR", start, {
          leanMs: outcome.ms,
          diagnostics: [diagnostic("proof", 1, 0, 1, "CHECKER_FAILED", "The checker produced no usable output")],
          ...generated,
        }),
      };
    }

    const parsed = parseLeanOutput(outcome.lines, {
      start,
      file,
      proofText: splitLines(request.proof),
      helperText: splitLines(request.helpers),
      parsedProof: splitLines(request.proof).map(parseProofLine),
      theorem: THEOREM,
    });

    if (parsed.status === "INTERNAL_ERROR") {
      console.error("INTERNAL_ERROR from Lean output", { levelId: request.levelId, lines: outcome.lines.slice(0, 20) });
    } else {
      deps.cache.set(key, { result: parsed, leanMs: outcome.ms });
    }
    return { kind: "response", response: { ...parsed, leanMs: outcome.ms, cached: false, ...generated } };
  };

  return { check };
};

const busyDiagnostic = (): Diagnostic => diagnostic("proof", 1, 0, 1, "BUSY", "The checker is busy. Try again in a moment.");

const timeoutDiagnostic = (): Diagnostic => diagnostic("proof", 1, 0, 1, "TIMEOUT", "Checking took too long and was stopped.");

export type Checker = ReturnType<typeof createChecker>;
