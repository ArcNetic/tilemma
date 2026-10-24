import type { CodeBoard } from "@pp/engine";

export type Tracked = {
  ids: number[][];
  rotations: number[][];
};

const ANGLES: Record<string, number> = { "^": 0, ">": 90, v: 180, "<": 270 };

export const angleOf = (code: string): number | null => ANGLES[code[1] ?? "."] ?? null;

const positionalIds = (board: CodeBoard): number[][] =>
  board.map((row, r) => row.map((_, c) => r * (board[0]?.length ?? 0) + c));

const initialRotations = (board: CodeBoard): number[][] => board.map((row) => row.map((code) => angleOf(code) ?? 0));

const changedPositions = (prev: CodeBoard, next: CodeBoard): [number, number][] =>
  prev.flatMap((row, r) => row.flatMap((code, c) => (next[r]?.[c] !== code ? [[r, c] as [number, number]] : [])));

const clone = <T,>(grid: T[][]): T[][] => grid.map((row) => [...row]);

const isSwap = (prev: CodeBoard, next: CodeBoard, a: [number, number], b: [number, number]): boolean =>
  next[a[0]]?.[a[1]] === prev[b[0]]?.[b[1]] && next[b[0]]?.[b[1]] === prev[a[0]]?.[a[1]];

const forwardTurn = (from: number, to: number): number => (to - from + 360) % 360;

export const advance = (prev: CodeBoard, next: CodeBoard, tracked: Tracked): Tracked => {
  const ids = clone(tracked.ids);
  const rotations = clone(tracked.rotations);
  const changed = changedPositions(prev, next);
  const [a, b] = changed;
  if (changed.length === 2 && a && b && isSwap(prev, next, a, b)) {
    [ids[a[0]]![a[1]], ids[b[0]]![b[1]]] = [ids[b[0]]![b[1]]!, ids[a[0]]![a[1]]!];
    [rotations[a[0]]![a[1]], rotations[b[0]]![b[1]]] = [rotations[b[0]]![b[1]]!, rotations[a[0]]![a[1]]!];
    return { ids, rotations };
  }
  for (const [r, c] of changed) {
    const before = angleOf(prev[r]![c]!);
    const after = angleOf(next[r]![c]!);
    if (before !== null && after !== null && before !== after) {
      rotations[r]![c] = rotations[r]![c]! + forwardTurn(before, after);
    } else if (after !== null) {
      rotations[r]![c] = Math.round(rotations[r]![c]! / 360) * 360 + after;
    }
  }
  return { ids, rotations };
};

export const trackFrames = (boards: readonly CodeBoard[]): Tracked[] => {
  const first = boards[0];
  if (!first) return [];
  const result: Tracked[] = [{ ids: positionalIds(first), rotations: initialRotations(first) }];
  for (let i = 1; i < boards.length; i++) {
    result.push(advance(boards[i - 1]!, boards[i]!, result[i - 1]!));
  }
  return result;
};
