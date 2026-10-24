import { splitLines } from "./proof.js";
import { colorNameOfCode, type Board, type Cell, type DirCode } from "./types.js";

const DIR_NAMES: Record<DirCode, string | null> = { "^": "n", ">": "e", v: "s", "<": "w", ".": null };

const cellLiteral = (cell: Cell): string => {
  const dir = DIR_NAMES[cell.dir];
  return `⟨.${colorNameOfCode(cell.color)}, ${dir ? `some .${dir}` : "none"}, ${cell.locked}⟩`;
};

export const toLeanLiteral = (board: Board): string =>
  `[${board.map((row) => `[${row.map(cellLiteral).join(", ")}]`).join(",\n      ")}]`;

export const PROOF_INDENT = 2;

export type LeanFile = {
  source: string;
  helpersStartLine: number;
  helpersLineCount: number;
  proofStartLine: number;
  proofLineCount: number;
  proofIndents: number[];
};

const HEADER = [
  "import ProofPuzzle",
  "open ProofPuzzle Move Color",
  "",
  "set_option maxHeartbeats 200000",
  "set_option maxRecDepth 2000",
  "",
];

const leadingSpaces = (line: string): number => line.length - line.trimStart().length;

export const buildLeanFile = (
  board: { start: Board; target: Board },
  helpers: string,
  proof: string,
  theoremName = "puzzle",
): LeanFile => {
  const helperLines = splitLines(helpers).map((line) => line.trimEnd());
  const proofLines = splitLines(proof).map((line) => line.trimEnd());
  const helperBlock = helperLines.length > 0 ? [...helperLines, ""] : [];
  const theoremHead = [
    `theorem ${theoremName} : Reach`,
    `    ${toLeanLiteral(board.target)}`,
    `    ${toLeanLiteral(board.start)} := by`,
  ].flatMap((chunk) => chunk.split("\n"));
  const body = proofLines.map((line) => (line.trim() === "" ? "" : " ".repeat(PROOF_INDENT) + line.trimStart()));
  const before = [...HEADER, ...helperBlock, ...theoremHead];
  const lines = [...before, ...body, "", `#print axioms ${theoremName}`, ""];
  return {
    source: lines.join("\n"),
    helpersStartLine: HEADER.length + 1,
    helpersLineCount: helperLines.length,
    proofStartLine: before.length + 1,
    proofLineCount: proofLines.length,
    proofIndents: proofLines.map(leadingSpaces),
  };
};
