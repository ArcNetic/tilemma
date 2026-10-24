import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  COLOR_CODES,
  DIR_CODES,
  applyAll,
  boardsEqual,
  buildLeanFile,
  cellAt,
  diff,
  explainIllegal,
  legal,
  parseBoard,
  parseCode,
  parseProofLine,
  serializeBoard,
  step,
  toLeanLiteral,
  trace,
  type Board,
  type Cell,
  type Move,
  type Pos,
} from "../src/index.js";

const cellArb: fc.Arbitrary<Cell> = fc.record({
  color: fc.constantFrom(...COLOR_CODES),
  dir: fc.constantFrom(...DIR_CODES),
  locked: fc.boolean(),
});

const boardArb: fc.Arbitrary<Board> = fc
  .tuple(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }))
  .chain(([rows, cols]) => fc.array(fc.array(cellArb, { minLength: cols, maxLength: cols }), { minLength: rows, maxLength: rows }));

const posArb: fc.Arbitrary<Pos> = fc.tuple(fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 7 }));

const moveArb: fc.Arbitrary<Move> = fc.oneof(
  fc.record({ kind: fc.constant("swap" as const), a: posArb, b: posArb }),
  fc.record({ kind: fc.constant("paint" as const), a: posArb, color: fc.constantFrom(...COLOR_CODES) }),
  fc.record({ kind: fc.constant("rotate" as const), a: posArb }),
);

const touched = (move: Move): Pos[] => (move.kind === "swap" ? [move.a, move.b] : [move.a]);

describe("codes", () => {
  it("round-trips cell codes", () => {
    for (const code of ["R^", "G.", "B>#", "Kv", "W<#"]) {
      expect(serializeBoard(parseBoard([[code]]))[0]![0]).toBe(code);
    }
  });

  it("rejects invalid codes", () => {
    expect(() => parseCode("X^")).toThrow();
    expect(() => parseCode("R")).toThrow();
    expect(() => parseCode("R^##")).toThrow();
  });
});

describe("moves", () => {
  const board = parseBoard([
    ["R^", "G.#"],
    ["B.", "Y>"],
  ]);

  it("swaps whole cells", () => {
    const next = step({ kind: "swap", a: [0, 0], b: [1, 1] }, board);
    expect(serializeBoard(next)).toEqual([
      ["Y>", "G.#"],
      ["B.", "R^"],
    ]);
  });

  it("reports reasons in a fixed order", () => {
    expect(explainIllegal({ kind: "swap", a: [0, 0], b: [0, 0] }, board)?.reason).toBe("SAME_CELL");
    expect(explainIllegal({ kind: "swap", a: [0, 1], b: [0, 1] }, board)?.reason).toBe("SAME_CELL");
    expect(explainIllegal({ kind: "swap", a: [0, 0], b: [0, 1] }, board)).toEqual({ reason: "LOCKED", cells: [[0, 1]] });
    expect(explainIllegal({ kind: "swap", a: [5, 5], b: [0, 1] }, board)).toEqual({ reason: "OUT_OF_BOUNDS", cells: [[5, 5]] });
    expect(explainIllegal({ kind: "rotate", a: [1, 0] }, board)?.reason).toBe("NOT_ROTATABLE");
    expect(explainIllegal({ kind: "rotate", a: [0, 1] }, board)?.reason).toBe("LOCKED");
    expect(explainIllegal({ kind: "paint", a: [2, 0], color: "R" }, board)?.reason).toBe("OUT_OF_BOUNDS");
  });

  it("traces until the first failure", () => {
    const result = trace(
      [
        { kind: "rotate", a: [0, 0] },
        { kind: "paint", a: [0, 1], color: "R" },
        { kind: "rotate", a: [0, 0] },
      ],
      board,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedAt).toBe(1);
      expect(result.states).toHaveLength(2);
    }
  });

  it("diffs boards cell by cell", () => {
    expect(diff(board, step({ kind: "rotate", a: [1, 1] }, board))).toEqual([[1, 1]]);
  });
});

describe("properties", () => {
  it("swap twice is identity", () => {
    fc.assert(
      fc.property(boardArb, posArb, posArb, (board, a, b) => {
        const move: Move = { kind: "swap", a, b };
        fc.pre(legal(move, board));
        expect(boardsEqual(step(move, step(move, board)), board)).toBe(true);
      }),
    );
  });

  it("four rotations of a rotatable cell is identity", () => {
    fc.assert(
      fc.property(boardArb, posArb, (board, a) => {
        const move: Move = { kind: "rotate", a };
        fc.pre(legal(move, board));
        expect(boardsEqual(applyAll([move, move, move, move], board)!, board)).toBe(true);
      }),
    );
  });

  it("paint is idempotent", () => {
    fc.assert(
      fc.property(boardArb, posArb, fc.constantFrom(...COLOR_CODES), (board, a, color) => {
        const move: Move = { kind: "paint", a, color };
        expect(boardsEqual(step(move, step(move, board)), step(move, board))).toBe(true);
      }),
    );
  });

  it("moves touch only their target cells", () => {
    fc.assert(
      fc.property(boardArb, moveArb, (board, move) => {
        const changed = diff(board, step(move, board));
        const targets = touched(move);
        expect(changed.every(([r, c]) => targets.some(([tr, tc]) => tr === r && tc === c))).toBe(true);
      }),
    );
  });

  it("illegal moves leave the board unchanged and explainIllegal agrees with legal", () => {
    fc.assert(
      fc.property(boardArb, moveArb, (board, move) => {
        const issue = explainIllegal(move, board);
        expect(issue === undefined).toBe(legal(move, board));
        if (issue) {
          expect(boardsEqual(step(move, board), board)).toBe(true);
          expect(issue.cells.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it("applyAll composes over concatenation", () => {
    fc.assert(
      fc.property(boardArb, fc.array(moveArb, { maxLength: 4 }), fc.array(moveArb, { maxLength: 4 }), (board, xs, ys) => {
        const mid = applyAll(xs, board);
        const whole = applyAll([...xs, ...ys], board);
        if (mid === undefined) expect(whole).toBeUndefined();
        else {
          const rest = applyAll(ys, mid);
          expect(rest === undefined ? whole === undefined : whole !== undefined && boardsEqual(rest, whole)).toBe(true);
        }
      }),
    );
  });

  it("cellAt matches bounds", () => {
    fc.assert(
      fc.property(boardArb, posArb, (board, p) => {
        const inside = p[0] < board.length && p[1] < board[0]!.length;
        expect(cellAt(board, p) !== undefined).toBe(inside);
      }),
    );
  });
});

describe("parseProofLine", () => {
  it("parses each move", () => {
    expect(parseProofLine("swap (0, 0) (0, 1)")).toEqual({ kind: "move", move: { kind: "swap", a: [0, 0], b: [0, 1] } });
    expect(parseProofLine("  paint (1,2) red -- note")).toEqual({ kind: "move", move: { kind: "paint", a: [1, 2], color: "R" } });
    expect(parseProofLine("rotate (2, 0)")).toEqual({ kind: "move", move: { kind: "rotate", a: [2, 0] } });
    expect(parseProofLine("run ccw 1 1")).toEqual({ kind: "run", name: "ccw", args: [1, 1] });
    expect(parseProofLine("   ")).toEqual({ kind: "blank" });
    expect(parseProofLine("-- hello")).toEqual({ kind: "blank" });
  });

  it("reports precise columns", () => {
    expect(parseProofLine("swap (0, 0) (0 1)")).toMatchObject({ kind: "invalid", colStart: 15 });
    expect(parseProofLine("jump (0, 0)")).toMatchObject({ kind: "invalid", colStart: 0, colEnd: 4 });
    expect(parseProofLine("paint (0, 0) pink")).toMatchObject({ kind: "invalid", colStart: 13 });
    expect(parseProofLine("swap (0, 0) (0, 1) x")).toMatchObject({ kind: "invalid", colStart: 19 });
    expect(parseProofLine("swap (0, 0) #")).toMatchObject({ kind: "invalid", colStart: 12 });
  });
});

describe("lean template", () => {
  const level = { start: parseBoard([["R^", "B.#"]]), target: parseBoard([["B.#", "R^"]]) };

  it("renders board literals", () => {
    expect(toLeanLiteral(level.start)).toBe("[[⟨.red, some .n, false⟩, ⟨.blue, none, true⟩]]");
  });

  it("maps proof and helper lines", () => {
    const file = buildLeanFile(level, "def a : List Move := []", "swap (0, 0) (0, 1)\n\n  rotate (0, 1)");
    const lines = file.source.split("\n");
    expect(lines[file.helpersStartLine - 1]).toBe("def a : List Move := []");
    expect(lines[file.proofStartLine - 1]).toBe("  swap (0, 0) (0, 1)");
    expect(lines[file.proofStartLine]).toBe("");
    expect(lines[file.proofStartLine + 1]).toBe("  rotate (0, 1)");
    expect(file.proofIndents).toEqual([0, 0, 2]);
  });

  it("is byte-identical across calls", () => {
    expect(buildLeanFile(level, "", "swap (0, 0) (0, 1)").source).toBe(buildLeanFile(level, "", "swap (0, 0) (0, 1)").source);
  });

  it("omits the helper block when empty", () => {
    const file = buildLeanFile(level, "", "swap (0, 0) (0, 1)");
    expect(file.helpersLineCount).toBe(0);
    expect(file.source).not.toContain("def ");
  });
});
