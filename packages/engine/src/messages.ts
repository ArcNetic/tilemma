import { formatPos } from "./proof.js";
import type { Pos } from "./types.js";

const listCells = (cells: readonly Pos[]): string => cells.map(formatPos).join(" and ");

export const reasonMessage = (reason: string, cells: readonly Pos[]): string => {
  switch (reason) {
    case "LOCKED":
      return `${cells.length > 1 ? "Blocks" : "Block"} ${listCells(cells)} ${cells.length > 1 ? "are" : "is"} locked and cannot be changed.`;
    case "OUT_OF_BOUNDS":
      return `${listCells(cells)} ${cells.length > 1 ? "are" : "is"} outside the board.`;
    case "SAME_CELL":
      return "A swap needs two different cells.";
    case "NOT_ROTATABLE":
      return `Block ${listCells(cells)} has no arrow, so it cannot rotate.`;
    default:
      return "That move is not allowed.";
  }
};
