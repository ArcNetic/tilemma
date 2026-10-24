import {
  diff,
  levelBoards,
  parseBoard,
  parseProofLine,
  splitLines,
  type CheckResponse,
  type LevelSummary,
  type Pos,
  type PublicLevel,
} from "@pp/engine";
import { buildFrames, clampPosition, lastPosition, positionForLine, type Frame } from "../lib/frames.js";
import { trackFrames, type Tracked } from "../lib/identity.js";
import { computePreview } from "../lib/preview.js";
import { recordSolve, type Progress } from "../lib/progress.js";
import { viewFromPreview, viewFromResponse, type View } from "../lib/view.js";

export type Draft = { proof: string; helpers: string };

export type Verified = { levelId: string; draft: Draft; response: CheckResponse };

export type GameState = {
  levels: LevelSummary[];
  level: PublicLevel | null;
  loadError: string | null;
  draft: Draft;
  settled: Draft;
  verified: Verified | null;
  checking: boolean;
  offline: boolean;
  position: number;
  followEnd: boolean;
  progress: Progress;
  drawerOpen: boolean;
  showLean: boolean;
  showDiff: boolean;
  hintVisible: boolean;
  successOpen: boolean;
};

export type Action =
  | { type: "levelsLoaded"; levels: LevelSummary[] }
  | { type: "levelLoaded"; level: PublicLevel }
  | { type: "loadFailed"; message: string }
  | { type: "edit"; pane: "proof" | "helpers"; text: string }
  | { type: "settle" }
  | { type: "checkStarted" }
  | { type: "checkFinished"; verified: Verified }
  | { type: "checkFailed"; offline: boolean }
  | { type: "online" }
  | { type: "stepTo"; position: number }
  | { type: "followEnd" }
  | { type: "cursorLine"; line: number; frames: Frame[] }
  | { type: "toggleDrawer"; open?: boolean }
  | { type: "toggleLean" }
  | { type: "toggleDiff" }
  | { type: "toggleHint" }
  | { type: "reset" }
  | { type: "dismissSuccess" };

export const starterDraft = (level: PublicLevel): Draft => ({ proof: "", helpers: level.starterHelpers ?? "" });

export const initialState = (progress: Progress): GameState => ({
  levels: [],
  level: null,
  loadError: null,
  draft: { proof: "", helpers: "" },
  settled: { proof: "", helpers: "" },
  verified: null,
  checking: false,
  offline: false,
  position: 0,
  followEnd: true,
  progress,
  drawerOpen: false,
  showLean: false,
  showDiff: false,
  hintVisible: false,
  successOpen: false,
});

export const sameDraft = (a: Draft, b: Draft): boolean => a.proof === b.proof && a.helpers === b.helpers;

export const countMoves = (proof: string): number =>
  splitLines(proof).filter((line) => {
    const parsed = parseProofLine(line);
    return parsed.kind === "move" || parsed.kind === "run";
  }).length;

const verifiedFor = (state: GameState): Verified | null =>
  state.verified && state.level && state.verified.levelId === state.level.id && sameDraft(state.verified.draft, state.draft) ? state.verified : null;

export const reduce = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case "levelsLoaded":
      return { ...state, levels: action.levels };
    case "levelLoaded": {
      const draft = starterDraft(action.level);
      return {
        ...state,
        level: action.level,
        loadError: null,
        draft,
        settled: draft,
        verified: null,
        checking: false,
        position: 0,
        followEnd: true,
        hintVisible: false,
        showDiff: false,
        successOpen: false,
        drawerOpen: false,
      };
    }
    case "loadFailed":
      return { ...state, loadError: action.message };
    case "edit": {
      const draft = { ...state.draft, [action.pane]: action.text };
      return { ...state, draft, followEnd: true, successOpen: false };
    }
    case "settle":
      return { ...state, settled: state.draft };
    case "checkStarted":
      return { ...state, checking: true };
    case "checkFinished": {
      const next: GameState = { ...state, checking: false, offline: false, verified: action.verified };
      const matches = state.level && action.verified.levelId === state.level.id && sameDraft(action.verified.draft, state.draft);
      if (!matches || !state.level || action.verified.response.status !== "SOLVED") return next;
      const moves = countMoves(action.verified.draft.proof);
      return { ...next, progress: recordSolve(state.progress, state.level.id, moves, state.level.par), successOpen: true };
    }
    case "checkFailed":
      return { ...state, checking: false, offline: action.offline || state.offline };
    case "online":
      return { ...state, offline: false };
    case "stepTo":
      return { ...state, position: action.position, followEnd: false };
    case "followEnd":
      return { ...state, followEnd: true };
    case "cursorLine":
      return { ...state, position: positionForLine(action.frames, action.line), followEnd: false };
    case "toggleDrawer":
      return { ...state, drawerOpen: action.open ?? !state.drawerOpen };
    case "toggleLean":
      return { ...state, showLean: !state.showLean };
    case "toggleDiff":
      return { ...state, showDiff: !state.showDiff };
    case "toggleHint":
      return { ...state, hintVisible: !state.hintVisible };
    case "reset": {
      if (!state.level) return state;
      const draft = starterDraft(state.level);
      return { ...state, draft, settled: draft, verified: null, position: 0, followEnd: true, successOpen: false, showDiff: false };
    }
    case "dismissSuccess":
      return { ...state, successOpen: false };
  }
};

const OVERRIDING_STATUSES = new Set(["SYNTAX_ERROR", "FORBIDDEN", "TIMEOUT", "BUSY", "INTERNAL_ERROR"]);

export const selectView = (state: GameState): View | null => {
  if (!state.level) return null;
  const boards = levelBoards({ start: state.level.start, target: state.level.target });
  const preview = computePreview(boards.start, boards.target, state.settled.proof);
  const verified = verifiedFor(state);
  if (!verified) return viewFromPreview(preview);
  const view = viewFromResponse(verified.response);
  if (OVERRIDING_STATUSES.has(view.status)) {
    return { ...viewFromPreview(preview), source: "verified", status: view.status, diagnostics: view.diagnostics, leanMs: view.leanMs };
  }
  return view;
};

export type Derived = {
  view: View;
  frames: Frame[];
  tracked: Tracked[];
  position: number;
  frame: Frame;
  currentTracked: Tracked | undefined;
  atEnd: boolean;
  errorCells: Pos[];
  mismatchCells: Pos[];
  solved: boolean;
  moves: number;
  mismatchCount: number;
};

export const derive = (state: GameState, view: View): Derived => {
  const frames = buildFrames(view);
  const tracked = trackFrames(frames.map((f) => f.board));
  const position = state.followEnd ? lastPosition(frames) : clampPosition(frames, state.position);
  const frame = frames[position] ?? frames[0] ?? { board: [], line: null, sub: null, failed: false };
  const atEnd = position === lastPosition(frames);
  const target = state.level ? parseBoard(state.level.target) : [];
  const shown = frame.board.length > 0 ? parseBoard(frame.board) : [];
  const mismatch = target.length > 0 && shown.length > 0 ? diff(shown, target) : [];
  const failureCells = view.diagnostics.filter((d) => d.pane === "proof" && d.cells).flatMap((d) => d.cells ?? []);
  const showMismatch = atEnd && state.showDiff;
  const verified = verifiedFor(state);
  return {
    view,
    frames,
    tracked,
    position,
    frame,
    currentTracked: tracked[position],
    atEnd,
    errorCells: atEnd ? failureCells.map(([r, c]) => [r, c] as Pos) : [],
    mismatchCells: showMismatch ? mismatch : [],
    solved: view.status === "SOLVED" && verified !== null,
    moves: countMoves(state.draft.proof),
    mismatchCount: mismatch.length,
  };
};
