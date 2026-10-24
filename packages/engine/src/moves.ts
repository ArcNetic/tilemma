import type { Board, Cell, DirCode, Issue, Move, Pos, Reason } from "./types.js";

const CLOCKWISE: Record<DirCode, DirCode> = { "^": ">", ">": "v", v: "<", "<": "^", ".": "." };

export const cellAt = (board: Board, [r, c]: Pos): Cell | undefined => board[r]?.[c];

const updateCell = (board: Board, [r, c]: Pos, f: (cell: Cell) => Cell): Board =>
  board.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? f(cell) : cell)) : row));

const putCell = (board: Board, p: Pos, cell: Cell): Board => updateCell(board, p, () => cell);

export const samePos = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1];

const isOutside = (board: Board) => (p: Pos) => cellAt(board, p) === undefined;

const isLocked = (board: Board) => (p: Pos) => cellAt(board, p)?.locked ?? false;

const isFixedDirection = (board: Board) => (p: Pos) => cellAt(board, p)?.dir === ".";

const flagCells = (reason: Reason, bad: (p: Pos) => boolean, ps: Pos[]): Issue | undefined => {
  const hit = ps.filter(bad);
  return hit.length === 0 ? undefined : { reason, cells: hit };
};

const firstIssue = (checks: (() => Issue | undefined)[]): Issue | undefined => {
  for (const check of checks) {
    const issue = check();
    if (issue) return issue;
  }
  return undefined;
};

export const explainIllegal = (move: Move, board: Board): Issue | undefined => {
  switch (move.kind) {
    case "swap":
      return firstIssue([
        () => flagCells("OUT_OF_BOUNDS", isOutside(board), [move.a, move.b]),
        () => flagCells("SAME_CELL", () => samePos(move.a, move.b), [move.a]),
        () => flagCells("LOCKED", isLocked(board), [move.a, move.b]),
      ]);
    case "paint":
      return firstIssue([
        () => flagCells("OUT_OF_BOUNDS", isOutside(board), [move.a]),
        () => flagCells("LOCKED", isLocked(board), [move.a]),
      ]);
    case "rotate":
      return firstIssue([
        () => flagCells("OUT_OF_BOUNDS", isOutside(board), [move.a]),
        () => flagCells("LOCKED", isLocked(board), [move.a]),
        () => flagCells("NOT_ROTATABLE", isFixedDirection(board), [move.a]),
      ]);
  }
};

export const legal = (move: Move, board: Board): boolean => explainIllegal(move, board) === undefined;

const perform = (move: Move, board: Board): Board => {
  switch (move.kind) {
    case "swap": {
      const x = cellAt(board, move.a);
      const y = cellAt(board, move.b);
      return x && y ? putCell(putCell(board, move.a, y), move.b, x) : board;
    }
    case "paint":
      return updateCell(board, move.a, (cell) => ({ ...cell, color: move.color }));
    case "rotate":
      return updateCell(board, move.a, (cell) => ({ ...cell, dir: CLOCKWISE[cell.dir] }));
  }
};

export const step = (move: Move, board: Board): Board => (legal(move, board) ? perform(move, board) : board);

export const applyAll = (moves: readonly Move[], board: Board): Board | undefined =>
  moves.reduce<Board | undefined>((acc, move) => (acc && legal(move, acc) ? step(move, acc) : undefined), board);

export type Trace =
  | { ok: true; states: Board[] }
  | { ok: false; states: Board[]; failedAt: number; issue: Issue };

export const trace = (moves: readonly Move[], board: Board): Trace => {
  const states: Board[] = [board];
  for (const [index, move] of moves.entries()) {
    const current = states[states.length - 1]!;
    const issue = explainIllegal(move, current);
    if (issue) return { ok: false, states, failedAt: index, issue };
    states.push(step(move, current));
  }
  return { ok: true, states };
};

export const diff = (a: Board, b: Board): Pos[] =>
  a.flatMap((row, r) =>
    row.flatMap((cell, c) => {
      const other = b[r]?.[c];
      const same = other && other.color === cell.color && other.dir === cell.dir && other.locked === cell.locked;
      return same ? [] : [[r, c] as const];
    }),
  );
