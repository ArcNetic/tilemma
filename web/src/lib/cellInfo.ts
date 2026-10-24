import { colorNameOfCode, parseCode, type Cell, type ColorCode, type DirCode } from "@pp/engine";

export const COLOR_LABEL: Record<ColorCode, string> = {
  R: "red",
  G: "green",
  B: "blue",
  Y: "yellow",
  P: "purple",
  O: "orange",
  W: "white",
  K: "black",
};

export const DIR_LABEL: Record<DirCode, string> = {
  "^": "north",
  ">": "east",
  v: "south",
  "<": "west",
  ".": "none",
};

export const describeCell = (code: string, row: number, col: number): string => {
  const cell: Cell = parseCode(code);
  const parts: string[] = [colorNameOfCode(cell.color)];
  if (cell.dir !== ".") parts.push(`arrow ${DIR_LABEL[cell.dir]}`);
  if (cell.locked) parts.push("locked");
  return `Row ${row}, column ${col}: ${parts.join(", ")}`;
};

export type Ghost = { row: number; col: number; side: "top" | "bottom" | "left" | "right"; label: string };

export const ghostFor = (cell: readonly [number, number], rows: number, cols: number): Ghost => {
  const [r, c] = cell;
  const row = Math.max(0, Math.min(rows - 1, r));
  const col = Math.max(0, Math.min(cols - 1, c));
  const side = r < 0 ? "top" : r >= rows ? "bottom" : c < 0 ? "left" : "right";
  return { row, col, side, label: `(${r}, ${c}) is outside the board` };
};

export const outsideCells = (cells: readonly (readonly [number, number])[], rows: number, cols: number): (readonly [number, number])[] =>
  cells.filter(([r, c]) => r < 0 || c < 0 || r >= rows || c >= cols);

export const insideCells = (cells: readonly (readonly [number, number])[], rows: number, cols: number): (readonly [number, number])[] =>
  cells.filter(([r, c]) => r >= 0 && c >= 0 && r < rows && c < cols);
