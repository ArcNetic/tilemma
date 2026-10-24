import { parseBoard, serializeBoard } from "@pp/engine";
import { describe, expect, it } from "vitest";
import { buildFrames, clampPosition, lastPosition, positionForLine } from "../src/lib/frames.js";
import { trackFrames } from "../src/lib/identity.js";
import { computePreview } from "../src/lib/preview.js";
import { isUnlocked, loadProgress, recordSolve, saveProgress, starsFor } from "../src/lib/progress.js";
import { diagnosticsForPane, docLinesOf, firstFailureLine, isSystemDiagnostic, rangeFor } from "../src/lib/ranges.js";
import { disagreements, executedLines, viewFromPreview, viewFromResponse } from "../src/lib/view.js";

const start = parseBoard([
  ["R.", "G.#"],
  ["B^", "Y."],
]);
const target = parseBoard([
  ["B^", "G.#"],
  ["R.", "Y."],
]);

describe("computePreview", () => {
  it("steps through legal moves", () => {
    const preview = computePreview(start, target, "swap (0, 0) (1, 0)");
    expect(preview.states).toHaveLength(2);
    expect(preview.states[1]).toEqual([
      ["B^", "G.#"],
      ["R.", "Y."],
    ]);
    expect(preview.lineStates).toEqual([{ line: 1, stateIndex: 1 }]);
    expect(preview.diagnostics).toEqual([]);
  });

  it("stops at the first illegal move with its cells", () => {
    const preview = computePreview(start, target, "paint (0, 0) blue\nswap (0, 0) (0, 1)\nrotate (1, 0)");
    expect(preview.states).toHaveLength(2);
    expect(preview.diagnostics).toEqual([
      expect.objectContaining({ line: 2, code: "LOCKED", cells: [[0, 1]], pane: "proof" }),
    ]);
  });

  it("flags moves after the target is reached", () => {
    const preview = computePreview(start, target, "swap (0, 0) (1, 0)\nrotate (1, 0)");
    expect(preview.diagnostics[0]).toMatchObject({ code: "EXTRA_MOVES", line: 2 });
  });

  it("maps blank and comment lines to the previous state", () => {
    const preview = computePreview(start, target, "-- hi\nrotate (1, 0)\n\n");
    expect(preview.lineStates.map((l) => [l.line, l.stateIndex])).toEqual([
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
  });

  it("reports syntax errors with columns and stops", () => {
    const preview = computePreview(start, target, "rotate (1, 0)\nswap (0 0)");
    expect(preview.diagnostics[0]).toMatchObject({ code: "SYNTAX", line: 2 });
    expect(preview.states).toHaveLength(2);
  });

  it("asks for Lean on run lines", () => {
    const preview = computePreview(start, target, "rotate (1, 0)\nrun flip 0");
    expect(preview.needsLean).toBe(true);
    expect(preview.states).toHaveLength(2);
  });

  it("handles an empty proof", () => {
    const preview = computePreview(start, target, "");
    expect(preview.states).toHaveLength(1);
    expect(preview.lineStates).toEqual([]);
  });
});

describe("frames and stepping", () => {
  const verified = viewFromResponse({
    status: "SOLVED",
    states: [["a"], ["b"], ["c"], ["d"]].map((x) => [x]),
    lineStates: [
      { line: 1, stateIndex: 0 },
      { line: 2, stateIndex: 1 },
      { line: 3, stateIndex: 1 },
      { line: 4, stateIndex: 3, substeps: [[["x"]], [["y"]], [["d"]]] },
    ],
    diagnostics: [],
    axiomsOk: true,
    leanMs: 5,
    cached: false,
  });

  it("builds one frame per executed line and expands runs into substeps", () => {
    const frames = buildFrames(verified);
    expect(frames.map((f) => [f.line, f.sub])).toEqual([
      [null, null],
      [2, null],
      [4, 0],
      [4, 1],
      [4, 2],
    ]);
  });

  it("finds the position for a cursor line", () => {
    const frames = buildFrames(verified);
    expect(positionForLine(frames, 1)).toBe(0);
    expect(positionForLine(frames, 2)).toBe(1);
    expect(positionForLine(frames, 3)).toBe(1);
    expect(positionForLine(frames, 4)).toBe(4);
    expect(positionForLine(frames, 99)).toBe(4);
  });

  it("clamps positions", () => {
    const frames = buildFrames(verified);
    expect(clampPosition(frames, -3)).toBe(0);
    expect(clampPosition(frames, 99)).toBe(lastPosition(frames));
  });

  it("keeps partial substeps of a failing run line as failed frames", () => {
    const failing = viewFromResponse({
      status: "ILLEGAL",
      states: [[["a"]]],
      lineStates: [{ line: 1, stateIndex: 0, substeps: [[["x"]]] }],
      diagnostics: [],
      axiomsOk: null,
      leanMs: 1,
      cached: false,
    });
    const frames = buildFrames(failing);
    expect(frames).toHaveLength(2);
    expect(frames[1]).toMatchObject({ line: 1, sub: 0, failed: true });
  });

  it("lists executed lines", () => {
    expect(executedLines(verified)).toEqual([2, 4]);
  });
});

describe("identity tracking", () => {
  it("follows swapped cells and keeps others in place", () => {
    const boards = [
      [["R.", "G."]],
      [["G.", "R."]],
    ];
    const [first, second] = trackFrames(boards);
    expect(first!.ids).toEqual([[0, 1]]);
    expect(second!.ids).toEqual([[1, 0]]);
  });

  it("accumulates clockwise rotation", () => {
    const boards = [[["R<"]], [["R^"]], [["R>"]]];
    const tracked = trackFrames(boards);
    expect(tracked.map((t) => t.rotations[0]![0])).toEqual([270, 360, 450]);
  });

  it("keeps ids stable on paint", () => {
    const [a, b] = trackFrames([[["R.", "G."]], [["B.", "G."]]]);
    expect(b!.ids).toEqual(a!.ids);
  });

  it("swaps rotation state together with the cell", () => {
    const [, second] = trackFrames([[["R^", "G."]], [["G.", "R^"]]]);
    expect(second!.rotations).toEqual([[0, 0]]);
    expect(second!.ids).toEqual([[1, 0]]);
  });

  it("returns nothing for no boards", () => {
    expect(trackFrames([])).toEqual([]);
  });
});

describe("ranges", () => {
  const doc = docLinesOf("swap (0, 0) (0, 1)\n\nrotate (1, 1)");

  it("maps line and columns to offsets", () => {
    expect(rangeFor({ line: 1, colStart: 5, colEnd: 11 }, doc)).toEqual({ from: 5, to: 11 });
    expect(rangeFor({ line: 3, colStart: 0, colEnd: 6 }, doc)).toEqual({ from: 20, to: 26 });
  });

  it("clamps to the line and never returns an empty range on a non-empty line", () => {
    expect(rangeFor({ line: 1, colStart: 0, colEnd: 999 }, doc)).toEqual({ from: 0, to: 18 });
    expect(rangeFor({ line: 1, colStart: 18, colEnd: 18 }, doc)).toEqual({ from: 17, to: 18 });
  });

  it("ignores lines outside the document", () => {
    expect(rangeFor({ line: 9, colStart: 0, colEnd: 1 }, doc)).toBeUndefined();
    expect(rangeFor({ line: 0, colStart: 0, colEnd: 1 }, doc)).toBeUndefined();
  });

  it("handles an empty document", () => {
    expect(docLinesOf("").lines).toBe(1);
  });

  it("filters diagnostics by pane and finds the first failure line", () => {
    const diags = [
      { pane: "proof", line: 4, colStart: 0, colEnd: 1, severity: "error", code: "LOCKED", message: "" },
      { pane: "helpers", line: 1, colStart: 0, colEnd: 1, severity: "error", code: "LEAN_ERROR", message: "" },
      { pane: "proof", line: 2, colStart: 0, colEnd: 1, severity: "error", code: "INCOMPLETE", message: "" },
    ] as const;
    expect(diagnosticsForPane(diags, "helpers")).toHaveLength(1);
    expect(firstFailureLine(diags)).toBe(4);
    expect(firstFailureLine([])).toBeUndefined();
  });
});

describe("system diagnostics", () => {
  const system = (code: string) => ({ pane: "proof" as const, line: 1, colStart: 0, colEnd: 1, severity: "error" as const, code, message: "x" });

  it("recognises messages about the checker, not the proof", () => {
    for (const code of ["RATE_LIMITED", "BUSY", "TIMEOUT", "NO_VERDICT", "BAD_PAYLOAD"]) expect(isSystemDiagnostic(system(code))).toBe(true);
    for (const code of ["ILLEGAL", "SYNTAX_ERROR", "INCOMPLETE", "EXTRA_MOVES"]) expect(isSystemDiagnostic(system(code))).toBe(false);
  });

  it("does not treat them as the first failing line, but still finds a real failure after them", () => {
    expect(firstFailureLine([system("RATE_LIMITED")])).toBeUndefined();
    expect(firstFailureLine([system("TIMEOUT"), { ...system("ILLEGAL"), line: 3 }])).toBe(3);
  });
});

describe("progress", () => {
  it("awards stars against par", () => {
    expect(starsFor(2, 2)).toBe(3);
    expect(starsFor(3, 2)).toBe(2);
    expect(starsFor(9, 2)).toBe(1);
  });

  it("keeps the best result", () => {
    const once = recordSolve({}, "L01", 4, 2);
    const better = recordSolve(once, "L01", 2, 2);
    const worse = recordSolve(better, "L01", 6, 2);
    expect(worse.L01).toEqual({ best: 2, stars: 3 });
  });

  it("unlocks the next level after solving the previous one", () => {
    const ids = ["L01", "L02", "L03"];
    expect(isUnlocked({}, 1, ids)).toBe(true);
    expect(isUnlocked({}, 2, ids)).toBe(false);
    expect(isUnlocked({ L01: { best: 2, stars: 3 } }, 2, ids)).toBe(true);
  });

  it("survives broken storage", () => {
    expect(loadProgress({ getItem: () => "not json" })).toEqual({});
    expect(loadProgress({ getItem: () => JSON.stringify({ L01: { best: -1, stars: 9 } }) })).toEqual({});
    expect(loadProgress({ getItem: () => { throw new Error("blocked"); } })).toEqual({});
    expect(() => saveProgress({}, { setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });

  it("round-trips through storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveProgress({ L02: { best: 3, stars: 2 } }, storage);
    expect(loadProgress(storage)).toEqual({ L02: { best: 3, stars: 2 } });
  });
});

describe("disagreements", () => {
  it("reports lines where preview and verified boards differ", () => {
    const preview = computePreview(start, target, "swap (0, 0) (1, 0)");
    const same = viewFromResponse({
      status: "SOLVED",
      states: preview.states,
      lineStates: preview.lineStates,
      diagnostics: [],
      axiomsOk: true,
      leanMs: 1,
      cached: false,
    });
    expect(disagreements(preview, same)).toEqual([]);
    const different = { ...same, states: [preview.states[0]!, serializeBoard(start)] };
    expect(disagreements(preview, different)).toEqual([1]);
  });

  it("builds a pending view from a preview", () => {
    expect(viewFromPreview(computePreview(start, target, "")).status).toBe("PENDING");
  });
});
