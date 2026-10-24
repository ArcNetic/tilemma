import { COLOR_CODES, DIR_CODES, type Board, type Cell, type CodeBoard, type ColorCode, type DirCode } from "./types.js";

const CELL_CODE = /^([RGBYPOWK])([\^>v<.])(#?)$/;

export const parseCode = (code: string): Cell => {
  const match = CELL_CODE.exec(code);
  if (!match) throw new Error(`Invalid cell code: ${JSON.stringify(code)}`);
  return { color: match[1] as ColorCode, dir: match[2] as DirCode, locked: match[3] === "#" };
};

export const isCellCode = (code: string): boolean => CELL_CODE.test(code);

export const cellCode = (cell: Cell): string => `${cell.color}${cell.dir}${cell.locked ? "#" : ""}`;

export const parseBoard = (codes: readonly (readonly string[])[]): Board => codes.map((row) => row.map(parseCode));

export const serializeBoard = (board: Board): CodeBoard => board.map((row) => row.map(cellCode));

export const boardsEqual = (a: Board, b: Board): boolean =>
  JSON.stringify(serializeBoard(a)) === JSON.stringify(serializeBoard(b));

export const codeBoardsEqual = (a: readonly (readonly string[])[], b: readonly (readonly string[])[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export const dimensions = (board: Board): { rows: number; cols: number } => ({
  rows: board.length,
  cols: board[0]?.length ?? 0,
});

export const isRectangular = (board: Board): boolean => {
  const { cols } = dimensions(board);
  return board.length > 0 && cols > 0 && board.every((row) => row.length === cols);
};

export const allColorCodes: readonly ColorCode[] = COLOR_CODES;
export const allDirCodes: readonly DirCode[] = DIR_CODES;
