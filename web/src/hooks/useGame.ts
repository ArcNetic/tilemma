import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { CheckRequest } from "@pp/engine";
import { ApiError, fetchHealth, fetchLevel, fetchLevels, postCheck } from "../lib/api.js";
import { loadProgress, saveProgress } from "../lib/progress.js";
import { disagreements } from "../lib/view.js";
import { computePreview } from "../lib/preview.js";
import { levelBoards } from "@pp/engine";
import { derive, initialState, reduce, selectView, type Draft } from "../state/game.js";

const PREVIEW_DEBOUNCE_MS = 150;
const CHECK_DEBOUNCE_MS = 600;
const HEALTH_POLL_MS = 4000;
const LAST_LEVEL_KEY = "tilemma-last-level";

const readLastLevel = (): string | null => {
  try {
    return localStorage.getItem(LAST_LEVEL_KEY);
  } catch {
    return null;
  }
};

const writeLastLevel = (id: string): void => {
  try {
    localStorage.setItem(LAST_LEVEL_KEY, id);
  } catch {
    return;
  }
};

const isBlank = (draft: Draft): boolean => draft.proof.trim() === "";

export const useGame = () => {
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState(loadProgress()));
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(state.draft);
  draftRef.current = state.draft;
  const levelId = state.level?.id ?? null;

  const loadLevel = useCallback(async (id: string) => {
    try {
      dispatch({ type: "levelLoaded", level: await fetchLevel(id) });
      writeLastLevel(id);
    } catch (error) {
      dispatch({ type: "loadFailed", message: error instanceof ApiError && error.offline ? "Cannot reach the server" : "Could not load the level" });
    }
  }, []);

  const boot = useCallback(async () => {
    try {
      const levels = await fetchLevels();
      dispatch({ type: "levelsLoaded", levels });
      const remembered = readLastLevel();
      const first = levels.find((l) => l.id === remembered) ?? levels[0];
      if (first) await loadLevel(first.id);
    } catch (error) {
      dispatch({ type: "loadFailed", message: error instanceof ApiError && error.offline ? "Cannot reach the server" : "Could not load levels" });
      dispatch({ type: "checkFailed", offline: error instanceof ApiError && error.offline });
    }
  }, [loadLevel]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    saveProgress(state.progress);
  }, [state.progress]);

  const runCheck = useCallback(
    async (id: string, draft: Draft) => {
      controller.current?.abort();
      const mine = ++sequence.current;
      const abort = new AbortController();
      controller.current = abort;
      dispatch({ type: "checkStarted" });
      const request: CheckRequest = { levelId: id, helpers: draft.helpers, proof: draft.proof };
      try {
        const response = await postCheck(request, abort.signal);
        if (mine !== sequence.current) return;
        dispatch({ type: "checkFinished", verified: { levelId: id, draft, response } });
      } catch (error) {
        if (mine !== sequence.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        dispatch({ type: "checkFailed", offline: error instanceof ApiError && error.offline });
      }
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => dispatch({ type: "settle" }), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.draft]);

  useEffect(() => {
    if (!levelId) return;
    if (checkTimer.current) clearTimeout(checkTimer.current);
    controller.current?.abort();
    sequence.current++;
    if (isBlank(state.draft)) {
      dispatch({ type: "checkFailed", offline: false });
      return;
    }
    const draft = state.draft;
    checkTimer.current = setTimeout(() => void runCheck(levelId, draft), CHECK_DEBOUNCE_MS);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [state.draft, levelId, runCheck]);

  useEffect(() => {
    if (!state.offline) return;
    const timer = setInterval(async () => {
      if (await fetchHealth()) {
        dispatch({ type: "online" });
        if (levelId) {
          if (state.levels.length === 0) void boot();
          else void runCheck(levelId, draftRef.current);
        }
      }
    }, HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [state.offline, levelId, runCheck, boot, state.levels.length]);

  const view = useMemo(() => selectView(state), [state]);
  const derived = useMemo(() => (view ? derive(state, view) : null), [state, view]);

  useEffect(() => {
    if (!state.level || !state.verified || state.verified.response.status === "BUSY") return;
    const boards = levelBoards({ start: state.level.start, target: state.level.target });
    const preview = computePreview(boards.start, boards.target, state.verified.draft.proof);
    if (preview.needsLean) return;
    const verifiedView = selectView({ ...state, draft: state.verified.draft });
    if (!verifiedView || verifiedView.source !== "verified") return;
    const bad = disagreements(preview, verifiedView);
    if (bad.length > 0) console.error("Preview and Lean disagree on lines", bad, { preview, verifiedView });
  }, [state.verified]); // eslint-disable-line react-hooks/exhaustive-deps

  const runNow = useCallback(() => {
    if (!levelId || isBlank(draftRef.current)) return;
    if (checkTimer.current) clearTimeout(checkTimer.current);
    void runCheck(levelId, draftRef.current);
  }, [levelId, runCheck]);

  return { state, dispatch, view, derived, loadLevel, runNow };
};
