export const COLOR_CODES = ["R", "G", "B", "Y", "P", "O", "W", "K"] as const;
export const DIR_CODES = ["^", ">", "v", "<", "."] as const;
export const COLOR_NAMES = ["red", "green", "blue", "yellow", "purple", "orange", "white", "black"] as const;
export const MOVE_KINDS = ["swap", "paint", "rotate"] as const;
export const REASONS = ["OUT_OF_BOUNDS", "SAME_CELL", "LOCKED", "NOT_ROTATABLE"] as const;

export type ColorCode = (typeof COLOR_CODES)[number];
export type DirCode = (typeof DIR_CODES)[number];
export type ColorName = (typeof COLOR_NAMES)[number];
export type MoveKind = (typeof MOVE_KINDS)[number];
export type Reason = (typeof REASONS)[number];

export type Cell = { readonly color: ColorCode; readonly dir: DirCode; readonly locked: boolean };
export type Board = readonly (readonly Cell[])[];
export type CodeBoard = string[][];
export type Pos = readonly [number, number];

export type Move =
  | { readonly kind: "swap"; readonly a: Pos; readonly b: Pos }
  | { readonly kind: "paint"; readonly a: Pos; readonly color: ColorCode }
  | { readonly kind: "rotate"; readonly a: Pos };

export type Issue = { readonly reason: Reason; readonly cells: Pos[] };

export const colorCodeOfName = (name: ColorName): ColorCode => COLOR_CODES[COLOR_NAMES.indexOf(name)]!;

export const colorNameOfCode = (code: ColorCode): ColorName => COLOR_NAMES[COLOR_CODES.indexOf(code)]!;

export const isColorName = (s: string): s is ColorName => (COLOR_NAMES as readonly string[]).includes(s);

export const isColorCode = (s: string): s is ColorCode => (COLOR_CODES as readonly string[]).includes(s);
