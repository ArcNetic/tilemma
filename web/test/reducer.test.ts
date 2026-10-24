import type { CheckResponse, PublicLevel } from "@pp/engine";
import { describe, expect, it } from "vitest";
import type { Frame } from "../src/lib/frames.js";
import { countMoves, derive, initialState, reduce, sameDraft, selectView, type Action, type GameState } from "../src/state/game.js";

const level: PublicLevel = {
  id: "L01",
  order: 1,
  title: "First Swap",
  concept: "swap",
  intro: "intro",
  hint: "hint",
  start: [["R.", "G."], ["B.", "Y."]],
  target: [["G.", "R."], ["Y.", "B."]],
  moves: ["swap"],
  palette: [],
  helpers: "none",
  par: 2,
};

const helperLevel: PublicLevel = { ...level, id: "L08", order: 8, helpers: "simple", starterHelpers: "def turn : List Move := []" };

const run = (actions: Action[], from?: GameState): GameState => actions.reduce(reduce, from ?? initialState({}));

const loaded = () => run([{ type: "levelLoaded", level }]);

const solvedResponse: CheckResponse = {
  status: "SOLVED",
  states: [
    [["R.", "G."], ["B.", "Y."]],
    [["G.", "R."], ["B.", "Y."]],
    [["G.", "R."], ["Y.", "B."]],
  ],
  lineStates: [
    { line: 1, stateIndex: 1 },
    { line: 2, stateIndex: 2 },
  ],
  diagnostics: [],
  axiomsOk: true,
  leanMs: 1500,
  cached: false,
};

const proof = "swap (0, 0) (0, 1)\nswap (1, 0) (1, 1)";

describe("reducer", () => {
  it("loads a level with a clean draft and starter helpers", () => {
    const state = run([{ type: "levelLoaded", level: helperLevel }]);
    expect(state.draft).toEqual({ proof: "", helpers: "def turn : List Move := []" });
    expect(state.settled).toEqual(state.draft);
    expect(state.followEnd).toBe(true);
  });

  it("follows the end of the proof while editing and closes the success dialog", () => {
    const state = run([{ type: "stepTo", position: 0 }, { type: "edit", pane: "proof", text: "swap (0, 0) (0, 1)" }], loaded());
    expect(state.followEnd).toBe(true);
    expect(state.draft.proof).toBe("swap (0, 0) (0, 1)");
    expect(state.successOpen).toBe(false);
  });

  it("settles the preview draft separately from the live draft", () => {
    const edited = run([{ type: "edit", pane: "proof", text: "rotate (0, 0)" }], loaded());
    expect(edited.settled.proof).toBe("");
    expect(run([{ type: "settle" }], edited).settled.proof).toBe("rotate (0, 0)");
  });

  it("records progress and opens the dialog only for the current draft", () => {
    const edited = run([{ type: "edit", pane: "proof", text: proof }], loaded());
    const stale = reduce(edited, { type: "checkFinished", verified: { levelId: "L01", draft: { proof: "old", helpers: "" }, response: solvedResponse } });
    expect(stale.progress).toEqual({});
    expect(stale.successOpen).toBe(false);
    const fresh = reduce(edited, { type: "checkFinished", verified: { levelId: "L01", draft: edited.draft, response: solvedResponse } });
    expect(fresh.progress.L01).toEqual({ best: 2, stars: 3 });
    expect(fresh.successOpen).toBe(true);
    expect(fresh.checking).toBe(false);
  });

  it("does not record a solve for other statuses", () => {
    const edited = run([{ type: "edit", pane: "proof", text: proof }], loaded());
    const next = reduce(edited, { type: "checkFinished", verified: { levelId: "L01", draft: edited.draft, response: { ...solvedResponse, status: "INCOMPLETE" } } });
    expect(next.progress).toEqual({});
  });

  it("stepping stops following the end, cursor movement syncs to a line", () => {
    const frames: Frame[] = [
      { board: [], line: null, sub: null, failed: false },
      { board: [], line: 1, sub: null, failed: false },
      { board: [], line: 3, sub: null, failed: false },
    ];
    const stepped = run([{ type: "stepTo", position: 1 }], loaded());
    expect(stepped).toMatchObject({ position: 1, followEnd: false });
    const synced = reduce(stepped, { type: "cursorLine", line: 3, frames });
    expect(synced).toMatchObject({ position: 2, followEnd: false });
    expect(reduce(synced, { type: "followEnd" }).followEnd).toBe(true);
  });

  it("tracks offline state and recovery", () => {
    const offline = run([{ type: "checkStarted" }, { type: "checkFailed", offline: true }], loaded());
    expect(offline).toMatchObject({ offline: true, checking: false });
    expect(reduce(offline, { type: "online" }).offline).toBe(false);
    expect(reduce(offline, { type: "checkFailed", offline: false }).offline).toBe(true);
  });

  it("resets to the starter draft", () => {
    const state = run([{ type: "levelLoaded", level: helperLevel }, { type: "edit", pane: "proof", text: "run turn" }, { type: "edit", pane: "helpers", text: "x" }, { type: "reset" }]);
    expect(state.draft).toEqual({ proof: "", helpers: "def turn : List Move := []" });
    expect(state.verified).toBeNull();
  });

  it("toggles panels", () => {
    const state = run([{ type: "toggleLean" }, { type: "toggleDiff" }, { type: "toggleHint" }, { type: "toggleDrawer", open: true }]);
    expect(state).toMatchObject({ showLean: true, showDiff: true, hintVisible: true, drawerOpen: true });
  });

  it("counts moves ignoring blanks and comments", () => {
    expect(countMoves("-- hi\nswap (0, 0) (0, 1)\n\nrun flip 1\nbad line")).toBe(2);
    expect(sameDraft({ proof: "a", helpers: "b" }, { proof: "a", helpers: "b" })).toBe(true);
  });
});

describe("selectView and derive", () => {
  const withProof = (text: string): GameState => run([{ type: "edit", pane: "proof", text }, { type: "settle" }], loaded());

  it("shows the instant preview until Lean answers", () => {
    const state = withProof("swap (0, 0) (0, 1)");
    const view = selectView(state)!;
    expect(view).toMatchObject({ source: "preview", status: "PENDING" });
    const derived = derive(state, view);
    expect(derived.frame.board).toEqual([["G.", "R."], ["B.", "Y."]]);
    expect(derived.solved).toBe(false);
  });

  it("switches to the verified view for the same draft", () => {
    const state = reduce(withProof(proof), { type: "checkFinished", verified: { levelId: "L01", draft: { proof, helpers: "" }, response: solvedResponse } });
    const view = selectView(state)!;
    expect(view).toMatchObject({ source: "verified", status: "SOLVED" });
    expect(derive(state, view).solved).toBe(true);
  });

  it("ignores a verified result for an older draft", () => {
    const base = withProof(proof);
    const state = reduce(base, { type: "checkFinished", verified: { levelId: "L01", draft: { proof: "swap (0, 0) (0, 1)", helpers: "" }, response: solvedResponse } });
    expect(selectView(state)!.source).toBe("preview");
  });

  it("keeps preview boards but Lean's diagnostics when the server rejects the text", () => {
    const rejected: CheckResponse = {
      status: "SYNTAX_ERROR",
      states: [[["R.", "G."], ["B.", "Y."]]],
      lineStates: [],
      diagnostics: [{ pane: "proof", line: 2, colStart: 0, colEnd: 3, severity: "error", code: "SYNTAX", message: "bad" }],
      axiomsOk: null,
      leanMs: 0,
      cached: false,
    };
    const text = "swap (0, 0) (0, 1)\nnonsense";
    const state = reduce(withProof(text), { type: "checkFinished", verified: { levelId: "L01", draft: { proof: text, helpers: "" }, response: rejected } });
    const view = selectView(state)!;
    expect(view.status).toBe("SYNTAX_ERROR");
    expect(view.states).toHaveLength(2);
    expect(view.diagnostics[0]!.message).toBe("bad");
  });

  it("shows red cells only at the end and mismatches for incomplete proofs", () => {
    const state = withProof("swap (0, 0) (0, 1)\nswap (0, 0) (5, 5)");
    const view = selectView(state)!;
    const atEnd = derive(state, view);
    expect(atEnd.errorCells).toEqual([[5, 5]]);
    const stepped = derive({ ...state, followEnd: false, position: 0 }, view);
    expect(stepped.errorCells).toEqual([]);
    expect(stepped.atEnd).toBe(false);
  });

  it("highlights differing blocks only on request", () => {
    const plain = withProof("swap (0, 0) (0, 1)");
    const quiet = derive(plain, selectView(plain)!);
    expect(quiet.mismatchCells).toEqual([]);
    expect(quiet.mismatchCount).toBe(2);
    const state = run([{ type: "toggleDiff" }], plain);
    const derived = derive(state, selectView(state)!);
    expect(derived.mismatchCells).toEqual([[1, 0], [1, 1]]);
    expect(derived.mismatchCount).toBe(2);
  });
});
