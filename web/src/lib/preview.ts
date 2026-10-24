import {
  boardsEqual,
  explainIllegal,
  parseProofLine,
  reasonMessage,
  serializeBoard,
  splitLines,
  step,
  type Board,
  type CodeBoard,
  type Diagnostic,
  type LineState,
} from "@pp/engine";

export type Preview = {
  states: CodeBoard[];
  lineStates: LineState[];
  diagnostics: Diagnostic[];
  needsLean: boolean;
};

const proofDiagnostic = (line: number, colStart: number, colEnd: number, code: string, message: string, extra: Partial<Diagnostic> = {}): Diagnostic => ({
  pane: "proof",
  line,
  colStart,
  colEnd,
  severity: "error",
  code,
  message,
  ...extra,
});

export const computePreview = (start: Board, target: Board, proof: string): Preview => {
  const lines = splitLines(proof);
  const states: CodeBoard[] = [serializeBoard(start)];
  const lineStates: LineState[] = [];
  let board = start;
  let solved = false;

  for (const [index, text] of lines.entries()) {
    const line = index + 1;
    const parsed = parseProofLine(text);

    if (parsed.kind === "blank") {
      lineStates.push({ line, stateIndex: states.length - 1 });
      continue;
    }
    if (parsed.kind === "invalid") {
      return {
        states,
        lineStates,
        diagnostics: [proofDiagnostic(line, parsed.colStart, parsed.colEnd, "SYNTAX", parsed.message)],
        needsLean: false,
      };
    }
    if (parsed.kind === "run") return { states, lineStates, diagnostics: [], needsLean: true };

    if (solved) {
      return {
        states,
        lineStates,
        diagnostics: [proofDiagnostic(line, 0, text.length, "EXTRA_MOVES", "The board already matches the target. Remove this move.")],
        needsLean: false,
      };
    }

    const issue = explainIllegal(parsed.move, board);
    if (issue) {
      return {
        states,
        lineStates,
        diagnostics: [
          proofDiagnostic(line, 0, text.length, issue.reason, reasonMessage(issue.reason, issue.cells), {
            cells: issue.cells.map(([r, c]) => [r, c] as [number, number]),
          }),
        ],
        needsLean: false,
      };
    }

    board = step(parsed.move, board);
    states.push(serializeBoard(board));
    lineStates.push({ line, stateIndex: states.length - 1 });
    solved = boardsEqual(board, target);
  }

  return { states, lineStates, diagnostics: [], needsLean: false };
};
