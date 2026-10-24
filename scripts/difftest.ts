import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COLOR_NAMES,
  boardsEqual,
  buildLeanFile,
  explainIllegal,
  formatMove,
  parseBoard,
  serializeBoard,
  splitLines,
  parseProofLine,
  step,
  type Board,
  type CodeBoard,
  type ColorCode,
  type Move,
  type Pos,
  type Reason,
} from "@pp/engine";
import { parseLeanOutput, parseMessages } from "../server/src/parse.js";
import { ColdRunner, resolveLeanBinary } from "../server/src/runner.js";

const CASES = Number(process.env.DIFF_CASES ?? 300);
const HELPER_CASES = Number(process.env.DIFF_HELPER_CASES ?? 80);
const SEED = Number(process.env.DIFF_SEED ?? 20261024);

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rand = mulberry32(SEED);
const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(items: readonly T[]): T => items[int(0, items.length - 1)]!;
const chance = (p: number): boolean => rand() < p;

const COLORS = ["R", "G", "B", "Y", "P", "O", "W", "K"] as const;
const DIRS = ["^", ">", "v", "<"] as const;

const randomBoard = (rows: number, cols: number): CodeBoard =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => `${pick(COLORS)}${chance(0.5) ? pick(DIRS) : "."}${chance(0.15) ? "#" : ""}`),
  );

const randomPos = (rows: number, cols: number): Pos => [int(0, chance(0.1) ? rows + 1 : rows - 1), int(0, chance(0.1) ? cols + 1 : cols - 1)];

const colorWord = (code: ColorCode): string => COLOR_NAMES[COLORS.indexOf(code)]!;

const randomMove = (rows: number, cols: number): Move => {
  const kind = pick(["swap", "paint", "rotate"] as const);
  if (kind === "swap") return { kind, a: randomPos(rows, cols), b: chance(0.1) ? randomPos(rows, cols) : randomPos(rows, cols) };
  if (kind === "paint") return { kind, a: randomPos(rows, cols), color: pick(COLORS) };
  return { kind, a: randomPos(rows, cols) };
};

type Expectation = {
  status: "SOLVED" | "INCOMPLETE" | "ILLEGAL" | "EXTRA_MOVES";
  states: CodeBoard[];
  failLine?: number;
  reason?: Reason;
  cells?: Pos[];
  substep?: number;
  substeps?: CodeBoard[];
};

type Case = {
  name: string;
  start: Board;
  target: Board;
  helpers: string;
  proof: string;
  expected: Expectation;
};

const expectFromMoves = (start: Board, target: Board, lines: readonly (Move | { helper: Move[] })[]): Expectation => {
  let board = start;
  const states: CodeBoard[] = [serializeBoard(start)];
  let reached = false;
  for (const [index, entry] of lines.entries()) {
    const line = index + 1;
    if (reached) return { status: "EXTRA_MOVES", states, failLine: line };
    if ("helper" in entry) {
      const trail: CodeBoard[] = [];
      let working = board;
      for (const [k, move] of entry.helper.entries()) {
        const issue = explainIllegal(move, working);
        if (issue) return { status: "ILLEGAL", states, failLine: line, reason: issue.reason, cells: issue.cells.map(([r, c]) => [r, c] as Pos), substep: k, substeps: trail };
        working = step(move, working);
        trail.push(serializeBoard(working));
      }
      board = working;
    } else {
      const issue = explainIllegal(entry, board);
      if (issue) return { status: "ILLEGAL", states, failLine: line, reason: issue.reason, cells: issue.cells.map(([r, c]) => [r, c] as Pos) };
      board = step(entry, board);
    }
    states.push(serializeBoard(board));
    reached = boardsEqual(board, target);
  }
  return { status: reached ? "SOLVED" : "INCOMPLETE", states };
};

const finalBoard = (start: Board, moves: readonly Move[]): Board => {
  let board = start;
  for (const move of moves) {
    if (explainIllegal(move, board)) break;
    board = step(move, board);
  }
  return board;
};

const perturb = (board: Board): Board => {
  const codes = serializeBoard(board).map((row) => [...row]);
  const r = int(0, codes.length - 1);
  const c = int(0, codes[0]!.length - 1);
  const cell = codes[r]![c]!;
  codes[r]![c] = `${cell[0] === "R" ? "G" : "R"}${cell.slice(1)}`;
  return parseBoard(codes);
};

const makeMoveCase = (index: number): Case => {
  const rows = int(2, 5);
  const cols = int(2, 5);
  const start = parseBoard(randomBoard(rows, cols));
  const moves = Array.from({ length: int(1, 8) }, () => randomMove(rows, cols));
  const legalPrefix: Move[] = [];
  let probe = start;
  for (const m of moves) {
    if (explainIllegal(m, probe)) break;
    probe = step(m, probe);
    legalPrefix.push(m);
  }
  const reachable = finalBoard(start, moves);
  const midpoint = legalPrefix.length > 1 && chance(0.3) ? finalBoard(start, legalPrefix.slice(0, int(1, legalPrefix.length - 1))) : reachable;
  const target = chance(0.55) ? midpoint : perturb(reachable);
  const trivial = boardsEqual(start, target);
  const effectiveTarget = trivial ? perturb(start) : target;
  return {
    name: `C${index}`,
    start,
    target: effectiveTarget,
    helpers: "",
    proof: moves.map((m) => formatMove(m).replace(/ (\w+)$/, (match, word: string) => (m.kind === "paint" ? ` ${colorWord(m.color)}` : match))).join("\n"),
    expected: expectFromMoves(start, effectiveTarget, moves),
  };
};

const makeHelperCase = (index: number): Case => {
  const rows = int(2, 4);
  const cols = int(2, 4);
  const start = parseBoard(randomBoard(rows, cols));
  const prefix = Array.from({ length: int(0, 2) }, () => randomMove(rows, cols));
  const helperMoves = Array.from({ length: int(1, 4) }, () => randomMove(rows, cols));
  const lines: (Move | { helper: Move[] })[] = [...prefix, { helper: helperMoves }];
  const helperBody = helperMoves.map((m) => `.${formatMove(m)}`).join(", ");
  const asDot = (m: Move): string =>
    m.kind === "swap" ? `.swap (${m.a[0]}, ${m.a[1]}) (${m.b[0]}, ${m.b[1]})` : m.kind === "paint" ? `.paint (${m.a[0]}, ${m.a[1]}) ${colorWord(m.color)}` : `.rotate (${m.a[0]}, ${m.a[1]})`;
  void helperBody;
  const probeExpect = expectFromMoves(start, perturb(start), lines);
  const reachedBoard = probeExpect.status === "ILLEGAL" ? perturb(start) : parseBoard(probeExpect.states[probeExpect.states.length - 1]!);
  const target = chance(0.6) && !boardsEqual(reachedBoard, start) ? reachedBoard : perturb(reachedBoard);
  const effectiveTarget = boardsEqual(start, target) ? perturb(start) : target;
  return {
    name: `H${index}`,
    start,
    target: effectiveTarget,
    helpers: `def h : List Move := [${helperMoves.map(asDot).join(", ")}]`,
    proof: [...prefix.map((m) => formatMove(m)), "run h"].join("\n"),
    expected: expectFromMoves(start, effectiveTarget, lines),
  };
};

const HEADER = ["import ProofPuzzle", "open ProofPuzzle Move Color", "", "set_option maxHeartbeats 200000", "set_option maxRecDepth 2000", ""];

const here = dirname(fileURLToPath(import.meta.url));
const leanDir = join(here, "..", "lean");

const cases: Case[] = [
  ...Array.from({ length: CASES }, (_, i) => makeMoveCase(i)),
  ...Array.from({ length: HELPER_CASES }, (_, i) => makeHelperCase(i)),
];

type Placed = { kase: Case; bodyStart: number; bodyEnd: number; file: ReturnType<typeof buildLeanFile> };

const placed: Placed[] = [];
const sourceLines = [...HEADER];
for (const kase of cases) {
  const file = buildLeanFile({ start: kase.start, target: kase.target }, kase.helpers, kase.proof, "puzzle");
  const body = file.source.split("\n").slice(HEADER.length);
  while (body.length > 0 && body[body.length - 1] === "") body.pop();
  sourceLines.push(`namespace ${kase.name}`);
  const bodyStart = sourceLines.length + 1;
  sourceLines.push(...body, `end ${kase.name}`, "");
  placed.push({ kase, bodyStart, bodyEnd: bodyStart + body.length - 1, file });
}

if (process.env.DIFF_DUMP) writeFileSync(process.env.DIFF_DUMP, sourceLines.join("\n"));

const runner = new ColdRunner({ leanDir, leanBin: resolveLeanBinary(leanDir), timeoutMs: 120_000, maxOutputBytes: 64_000_000, extraArgs: ["-DmaxErrors=1000000"] });
const started = performance.now();
const outcome = await runner.run(sourceLines.join("\n"));
console.log(`Lean compiled ${cases.length} cases in ${Math.round(performance.now() - started)} ms (${outcome.lines.length} messages)`);
if (outcome.timedOut || outcome.outputTruncated) {
  console.error("Lean run did not finish");
  process.exit(2);
}

const messages = parseMessages(outcome.lines);
const mismatches: string[] = [];
const tally: Record<string, number> = {};

placed.forEach(({ kase, bodyStart, bodyEnd, file }) => {
  const delta = bodyStart - (HEADER.length + 1);
  const own = messages
    .filter((m) => m.pos.line >= bodyStart && m.pos.line <= bodyEnd)
    .map((m) =>
      JSON.stringify({ ...m, pos: { ...m.pos, line: m.pos.line - delta }, endPos: m.endPos ? { ...m.endPos, line: m.endPos.line - delta } : null }),
    );
  const proofText = splitLines(kase.proof);
  const parsed = parseLeanOutput(own, {
    start: serializeBoard(kase.start),
    file,
    proofText,
    helperText: splitLines(kase.helpers),
    parsedProof: proofText.map(parseProofLine),
    theorem: `${kase.name}.puzzle`,
  });
  const want = kase.expected;
  const problems: string[] = [];
  if (parsed.status !== want.status) problems.push(`status ${parsed.status} != ${want.status}`);
  if (JSON.stringify(parsed.states) !== JSON.stringify(want.states)) problems.push("per-line states differ");
  const diag = parsed.diagnostics[0];
  if (want.status === "ILLEGAL") {
    if (diag?.line !== want.failLine) problems.push(`fail line ${diag?.line} != ${want.failLine}`);
    if (diag?.code !== want.reason) problems.push(`reason ${diag?.code} != ${want.reason}`);
    if (JSON.stringify(diag?.cells) !== JSON.stringify(want.cells)) problems.push(`cells ${JSON.stringify(diag?.cells)} != ${JSON.stringify(want.cells)}`);
    if (want.substep !== undefined && diag?.substep !== want.substep) problems.push(`substep ${diag?.substep} != ${want.substep}`);
    if (want.substeps) {
      const entry = parsed.lineStates.find((l) => l.line === want.failLine);
      if (JSON.stringify(entry?.substeps ?? []) !== JSON.stringify(want.substeps)) problems.push("partial substeps differ");
    }
  }
  if (want.status === "EXTRA_MOVES" && diag?.line !== want.failLine) problems.push(`extra line ${diag?.line} != ${want.failLine}`);
  const key = `${kase.name[0]}:${want.status}`;
  tally[key] = (tally[key] ?? 0) + 1;
  if (problems.length > 0) mismatches.push(`${kase.name}: ${problems.join("; ")}\n  proof: ${JSON.stringify(kase.proof)}\n  helpers: ${JSON.stringify(kase.helpers)}`);
});

console.log("coverage:", JSON.stringify(tally));
if (mismatches.length > 0) {
  console.error(`${mismatches.length} mismatches:\n${mismatches.slice(0, 12).join("\n")}`);
  process.exit(1);
}
console.log(`difftest: ${cases.length} cases, 0 mismatches (seed ${SEED})`);
