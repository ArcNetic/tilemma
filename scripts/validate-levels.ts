import {
  boardsEqual,
  dimensions,
  diff,
  isRectangular,
  levelBoards,
  parseProofLine,
  serializeBoard,
  step,
  legal,
  trace,
  type Board,
  type ColorCode,
  type Level,
  type Move,
} from "@pp/engine";
import { loadLevels } from "./levels-io.js";

const BFS_MAX_CELLS = 9;
const BFS_MAX_PAR = 4;

const allMoves = (board: Board, level: Level): Move[] => {
  const cells = board.flatMap((row, r) => row.map((_, c) => [r, c] as const));
  const swaps = level.moves.includes("swap")
    ? cells.flatMap((a, i) => cells.slice(i + 1).map((b): Move => ({ kind: "swap", a, b })))
    : [];
  const paints = level.moves.includes("paint")
    ? cells.flatMap((a) => level.palette.map((color): Move => ({ kind: "paint", a, color })))
    : [];
  const rotates = level.moves.includes("rotate") ? cells.map((a): Move => ({ kind: "rotate", a })) : [];
  return [...swaps, ...paints, ...rotates];
};

const key = (board: Board): string => JSON.stringify(serializeBoard(board));

const shortestSolutionLength = (level: Level, limit: number): number | undefined => {
  const { start, target } = levelBoards(level);
  const targetKey = key(target);
  const seen = new Set<string>([key(start)]);
  let frontier: Board[] = [start];
  for (let depth = 1; depth <= limit; depth++) {
    const next: Board[] = [];
    for (const board of frontier) {
      for (const move of allMoves(board, level)) {
        if (!legal(move, board)) continue;
        const after = step(move, board);
        const k = key(after);
        if (k === targetKey) return depth;
        if (!seen.has(k)) {
          seen.add(k);
          next.push(after);
        }
      }
    }
    frontier = next;
  }
  return undefined;
};

const proofMoveLines = (level: Level): ReturnType<typeof parseProofLine>[] =>
  level.reference.proof.map(parseProofLine).filter((p) => p.kind !== "blank");

const lockedCellsMatch = (start: Board, target: Board): boolean =>
  start.every((row, r) =>
    row.every((cell, c) => {
      const other = target[r]?.[c];
      return cell.locked === (other?.locked ?? false) && (!cell.locked || JSON.stringify(cell) === JSON.stringify(other));
    }),
  );

const checkLevel = (level: Level): string[] => {
  const problems: string[] = [];
  const { start, target } = levelBoards(level);
  if (!isRectangular(start) || !isRectangular(target)) return ["boards must be rectangular"];
  const sd = dimensions(start);
  const td = dimensions(target);
  if (sd.rows !== td.rows || sd.cols !== td.cols) problems.push("start and target dimensions differ");
  if (boardsEqual(start, target)) problems.push("start equals target");
  if (!lockedCellsMatch(start, target)) problems.push("locked cells differ between start and target");

  const mismatched = diff(start, target).length;
  if (Math.ceil(mismatched / 2) > level.par && level.helpers === "none") {
    problems.push(`lower bound ${Math.ceil(mismatched / 2)} exceeds par ${level.par}`);
  }

  const lines = proofMoveLines(level);
  if (lines.length !== level.par) problems.push(`reference has ${lines.length} lines but par is ${level.par}`);
  const invalid = lines.find((l) => l.kind === "invalid");
  if (invalid) problems.push(`reference has an unparsable line: ${invalid.kind === "invalid" ? invalid.message : ""}`);

  const usesHelpers = lines.some((l) => l.kind === "run");
  if (level.helpers === "none" && (usesHelpers || level.reference.helpers.trim() !== "")) {
    problems.push("non-helper level uses helpers");
  }
  if (level.helpers !== "none" && !usesHelpers) problems.push("helper level reference never uses run");

  const moves = lines.flatMap((l) => (l.kind === "move" ? [l.move] : []));
  for (const move of moves) {
    if (!level.moves.includes(move.kind)) problems.push(`reference uses forbidden move ${move.kind}`);
    if (move.kind === "paint" && !level.palette.includes(move.color)) problems.push(`reference paints outside palette: ${move.color}`);
  }

  const targetColors = new Set<ColorCode>(target.flatMap((row) => row.map((cell) => cell.color)));
  const startColors = new Set<ColorCode>(start.flatMap((row) => row.map((cell) => cell.color)));
  if (level.moves.includes("paint")) {
    for (const color of targetColors) {
      if (!startColors.has(color) && !level.palette.includes(color)) problems.push(`target color ${color} unreachable by palette`);
    }
  }

  if (level.helpers === "none") {
    const result = trace(moves, start);
    if (!result.ok) problems.push(`reference fails at line ${result.failedAt + 1}: ${result.issue.reason}`);
    else if (!boardsEqual(result.states[result.states.length - 1]!, target)) problems.push("reference does not reach target");

    const cellCount = sd.rows * sd.cols;
    if (cellCount <= BFS_MAX_CELLS && level.par <= BFS_MAX_PAR) {
      const shorter = shortestSolutionLength(level, level.par - 1);
      if (shorter !== undefined) problems.push(`a ${shorter}-move solution exists, par ${level.par} is not optimal`);
    }
  }

  return problems;
};

const levels = loadLevels();
const orders = levels.map((l) => l.order);
let failed = 0;

if (levels.length !== 12) {
  console.error(`expected 12 levels, found ${levels.length}`);
  failed++;
}
if (new Set(orders).size !== orders.length) {
  console.error("duplicate level orders");
  failed++;
}

for (const level of levels) {
  const problems = checkLevel(level);
  if (problems.length === 0) console.log(`ok   ${level.id} ${level.title} (par ${level.par})`);
  else {
    failed++;
    console.error(`FAIL ${level.id} ${level.title}`);
    for (const p of problems) console.error(`       - ${p}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`all ${levels.length} levels valid`);
