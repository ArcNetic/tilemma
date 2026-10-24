import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Diagnostic } from "@pp/engine";
import { ErrorBanner, HintBox, OfflineBanner } from "./components/Banners.js";
import { BoardView } from "./components/BoardView.js";
import { CodeEditor, type CodeEditorHandle } from "./components/CodeEditor.js";
import { EditorActions } from "./components/EditorActions.js";
import { EditorPane } from "./components/EditorPane.js";
import { Header } from "./components/Header.js";
import { LevelDrawer } from "./components/LevelDrawer.js";
import { LoadingSkeleton } from "./components/LoadingSkeleton.js";
import { Onboarding } from "./components/Onboarding.js";
import { ShowLeanPanel } from "./components/ShowLeanPanel.js";
import { Splitter } from "./components/Splitter.js";
import { StatusBar } from "./components/StatusBar.js";
import { Stepper } from "./components/Stepper.js";
import { SuccessOverlay } from "./components/SuccessOverlay.js";
import { Toast } from "./components/Toast.js";
import { useDelayedFlag } from "./hooks/useDelayedFlag.js";
import { useGame } from "./hooks/useGame.js";
import { useSplitRatio } from "./hooks/useSplitRatio.js";
import { clampPosition } from "./lib/frames.js";
import { diagnosticsForPane, firstFailureLine, isSystemDiagnostic } from "./lib/ranges.js";
import { DEFAULT_SPLIT_X, DEFAULT_SPLIT_Y, SPLIT_MAX, SPLIT_MIN, SPLIT_X_KEY, SPLIT_Y_KEY } from "./lib/split.js";
import { statusMessage } from "./lib/status.js";
import { sameDraft } from "./state/game.js";

const ONBOARDING_KEY = "tilemma-onboarding-done";
const UNLOCK_KEY = "tilemma-unlock-all";

/** Smallest sizes (px) the editor column, the stage and each editor pane may shrink to. */
const MIN_EDITOR_PX = 320;
const MIN_STAGE_PX = 460;
const MIN_PANE_PX = 112;

/** The success dialog waits for the board to finish its wave. */
const SUCCESS_DELAY_MS = 850;

const storedFlag = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const storeFlag = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    return;
  }
};

const helperNamesIn = (helpers: string): string[] => Array.from(helpers.matchAll(/^def\s+([a-z]\w*)/gm), (m) => m[1]!);

const asEditorDiagnostics = (diagnostics: Diagnostic[]): Diagnostic[] =>
  diagnostics.map((d) => (d.code === "INCOMPLETE" ? { ...d, severity: "warning" as const } : d));

/** Replies that say the checker could not give an answer, so Lean has confirmed nothing. */
const NO_VERDICT_STATUSES: ReadonlySet<string> = new Set(["BUSY", "TIMEOUT", "INTERNAL_ERROR"]);

const TRY_EXAMPLE = "swap (0, 0) (0, 1)";

const errorsIn = (diagnostics: readonly Diagnostic[]): number => diagnostics.filter((d) => d.severity === "error").length;

export const App = () => {
  const { state, dispatch, view, derived, loadLevel, runNow } = useGame();
  const proofEditor = useRef<CodeEditorHandle>(null);
  const workspace = useRef<HTMLElement>(null);
  const paneStack = useRef<HTMLDivElement>(null);
  const splitX = useSplitRatio(SPLIT_X_KEY, DEFAULT_SPLIT_X, SPLIT_MIN, SPLIT_MAX);
  const splitY = useSplitRatio(SPLIT_Y_KEY, DEFAULT_SPLIT_Y, SPLIT_MIN, SPLIT_MAX);
  const [copied, setCopied] = useState(false);
  const [targetLarge, setTargetLarge] = useState(false);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [unlockAll, setUnlockAll] = useState(() => storedFlag(UNLOCK_KEY) || new URLSearchParams(window.location.search).get("unlock") === "all");
  const [onboardingDone, setOnboardingDone] = useState(() => storedFlag(ONBOARDING_KEY));
  const [tourOpen, setTourOpen] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const showSuccess = useDelayedFlag(state.successOpen && (derived?.solved ?? false), reduceMotion ? 0 : SUCCESS_DELAY_MS);

  const level = state.level;
  const showHelpers = level !== null && level.helpers !== "none";

  const onStep = useCallback(
    (position: number) => {
      if (derived) dispatch({ type: "stepTo", position: clampPosition(derived.frames, position) });
    },
    [derived, dispatch],
  );

  const stepBy = useCallback(
    (delta: -1 | 1) => {
      if (derived) onStep(derived.position + delta);
    },
    [derived, onStep],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        stepBy(event.key === "ArrowLeft" ? -1 : 1);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepBy, runNow]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const proofDiagnostics = useMemo(() => (view ? asEditorDiagnostics(diagnosticsForPane(view.diagnostics, "proof").filter((d) => !isSystemDiagnostic(d))) : []), [view]);
  const helperDiagnostics = useMemo(() => (view ? diagnosticsForPane(view.diagnostics, "helpers") : []), [view]);
  const helperNames = useMemo(() => helperNamesIn(state.draft.helpers), [state.draft.helpers]);
  const failureLine = view ? firstFailureLine(view.diagnostics) : undefined;

  const generatedLean = state.verified?.response.generatedLean;
  const copyProof = async () => {
    const text = showHelpers ? `${state.draft.helpers}\n\n${state.draft.proof}` : state.draft.proof;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const toggleUnlock = () => {
    setUnlockAll((value) => {
      storeFlag(UNLOCK_KEY, !value);
      return !value;
    });
  };

  const finishOnboarding = () => {
    storeFlag(ONBOARDING_KEY, true);
    setOnboardingDone(true);
    setTourOpen(false);
  };

  const nextLevelId = useMemo(() => {
    if (!level) return null;
    return state.levels.find((l) => l.order === level.order + 1)?.id ?? null;
  }, [level, state.levels]);

  const insertCell = (row: number, col: number) => proofEditor.current?.insertAtCursor(`(${row}, ${col})`);

  if (!level || !view || !derived) {
    return (
      <div className="app">
        <Header level={null} stars={0} best={null} onOpenLevels={() => undefined} onHelp={() => undefined} />
        <div className="notices">
          <OfflineBanner visible={state.offline} />
        </div>
        <main className="empty-main">
          {state.loadError ? (
            <section className="load-error" role="alert" data-testid="load-error">
              <h1>Could not load the levels</h1>
              <p>{state.loadError}</p>
              <button type="button" className="primary" onClick={() => window.location.reload()}>
                Try again
              </button>
            </section>
          ) : (
            <div className="loading-shell">
              <p className="loading" role="status">
                Loading levels...
              </p>
              <LoadingSkeleton />
            </div>
          )}
        </main>
      </div>
    );
  }

  const verifiedCurrent = state.verified !== null && sameDraft(state.verified.draft, state.draft);
  const message = statusMessage({
    status: view.status,
    source: view.source,
    diagnostics: view.diagnostics,
    checking: state.checking,
    mismatchCount: derived.mismatchCount,
    hasProof: state.draft.proof.trim() !== "",
    needsLean: view.needsLean,
    offline: state.offline,
  });
  const heading =
    message.tone === "error" ? (view.status === "TIMEOUT" || view.status === "INTERNAL_ERROR" ? "Could not check the proof" : "Proof failed") : undefined;
  const confirmedByLean = view.source === "verified" && verifiedCurrent && !NO_VERDICT_STATUSES.has(view.status);
  const boardBadge = confirmedByLean ? "Verified by Lean" : view.needsLean ? "Preview, helpers need Lean" : "Preview";
  const badgeTone = confirmedByLean ? "verified" : state.checking ? "working" : "neutral";
  const progressEntry = state.progress[level.id];

  return (
    <div className="app">
      <Header
        level={level}
        stars={progressEntry?.stars ?? 0}
        best={progressEntry?.best ?? null}
        levelsOpen={state.drawerOpen}
        onOpenLevels={() => dispatch({ type: "toggleDrawer", open: !state.drawerOpen })}
        onHelp={() => setTourOpen(true)}
      />
      <div className="notices">
        <OfflineBanner visible={state.offline} />
        <ErrorBanner message={state.loadError} onRetry={() => void loadLevel(level.id)} />
      </div>

      <main className="workspace" ref={workspace} style={{ "--split-x": splitX.value } as CSSProperties}>
        <div className="stage">
          <div className="stage-board">
            <div className={targetLarge ? "stage-grid target-large" : "stage-grid"}>
              <div className="board-slot">
                <BoardView
                  title="Your board"
                  board={derived.frame.board}
                  tracked={derived.currentTracked}
                  errorCells={derived.errorCells}
                  mismatchCells={derived.mismatchCells}
                  badge={boardBadge}
                  badgeTone={badgeTone}
                  solved={derived.solved}
                  onCellClick={insertCell}
                  testId="board-current"
                />
              </div>
              <div className="inset-slot">
                <BoardView title="Target" variant="inset" board={level.target} onCellClick={insertCell} testId="board-target" />
                <button type="button" className="quiet inset-toggle" aria-pressed={targetLarge} onClick={() => setTargetLarge((v) => !v)}>
                  {targetLarge ? "Shrink target" : "Enlarge target"}
                </button>
              </div>
            </div>
          </div>

          <div className="stage-controls">
            <Stepper frames={derived.frames} position={derived.position} onStep={onStep} onHoverPosition={setHoverPosition} />
            <label className={state.showDiff ? "diff-toggle on" : "diff-toggle"}>
              <input type="checkbox" checked={state.showDiff} onChange={() => dispatch({ type: "toggleDiff" })} />
              <span className="diff-text">
                <strong>Highlight blocks that differ from the target</strong>
                <small>Turn on to mark every block that is not yet in the right place.</small>
              </span>
              <span className={derived.mismatchCount === 0 ? "diff-count ok" : "diff-count"} aria-live="polite">
                {derived.mismatchCount === 0 ? "Matches" : `${derived.mismatchCount} to fix`}
              </span>
            </label>
          </div>

          <div className="stage-context">
            <p className="intro" data-testid="level-intro">
              {level.intro}
            </p>
            <HintBox hint={state.hintVisible ? level.hint : null} onClose={() => dispatch({ type: "toggleHint" })} />
          </div>
        </div>

        <Splitter
          orientation="vertical"
          label="Resize the board and the editor"
          container={workspace}
          ratio={splitX}
          minFirstPx={MIN_STAGE_PX}
          minSecondPx={MIN_EDITOR_PX}
          testId="splitter-stage"
        />

        <div className="editor-col">
          <EditorActions onShowLean={() => dispatch({ type: "toggleLean" })} leanOpen={state.showLean} onHint={() => dispatch({ type: "toggleHint" })} onReset={() => dispatch({ type: "reset" })} hintShown={state.hintVisible} checking={state.checking} />


          <div className="pane-stack" ref={paneStack} style={{ "--split-y": splitY.value } as CSSProperties}>
            {showHelpers && (
              <>
                <EditorPane title="Helpers" className="pane-helpers" errorCount={errorsIn(helperDiagnostics)}>
                  <CodeEditor
                    variant="helpers"
                    value={state.draft.helpers}
                    ariaLabel="Helpers editor"
                    placeholderText="def name (n : Nat) : List Move := [...]"
                    diagnostics={helperDiagnostics}
                    dimAfterLine={null}
                    activeLine={null}
                    helperNames={helperNames}
                    onChange={(text) => dispatch({ type: "edit", pane: "helpers", text })}
                    onRun={runNow}
                  />
                </EditorPane>
                <Splitter
                  orientation="horizontal"
                  label="Resize the Helpers and Proof editors"
                  container={paneStack}
                  ratio={splitY}
                  minFirstPx={MIN_PANE_PX}
                  minSecondPx={MIN_PANE_PX}
                  testId="splitter-editors"
                />
              </>
            )}
            <EditorPane
              title="Proof"
              className="pane-proof"
              errorCount={errorsIn(proofDiagnostics)}
              actions={
                <>
                  <button type="button" className="quiet" onClick={copyProof}>
                    {copied ? "Copied" : "Copy proof"}
                  </button>
                </>
              }
            >
              <CodeEditor
                ref={proofEditor}
                variant="proof"
                value={state.draft.proof}
                ariaLabel="Proof editor"
                placeholderText="swap (0, 0) (0, 1)"
                diagnostics={proofDiagnostics}
                dimAfterLine={failureLine ?? null}
                activeLine={derived.frame.line}
                hoverLine={hoverPosition === null ? null : (derived.frames[hoverPosition]?.line ?? null)}
                helperNames={helperNames}
                onChange={(text) => dispatch({ type: "edit", pane: "proof", text })}
                onCursorLine={(line, docChanged) => {
                  if (!docChanged) dispatch({ type: "cursorLine", line, frames: derived.frames });
                }}
                onStep={stepBy}
                onRun={runNow}
              />
              {level.order === 1 && state.draft.proof.trim() === "" && (
                <button
                  type="button"
                  className="try-chip"
                  onClick={() => {
                    dispatch({ type: "edit", pane: "proof", text: TRY_EXAMPLE });
                    proofEditor.current?.focus();
                  }}
                >
                  Try it <code>{TRY_EXAMPLE}</code>
                </button>
              )}
            </EditorPane>
          </div>


          <StatusBar message={message} heading={heading} leanMs={verifiedCurrent ? view.leanMs : null} />
        </div>
      </main>

      {((level.order === 1 && !onboardingDone) || tourOpen) && <Onboarding onDone={finishOnboarding} />}

      <Toast message={copied ? "Proof copied to clipboard" : null} />

      <ShowLeanPanel source={generatedLean} open={state.showLean} onClose={() => dispatch({ type: "toggleLean" })} />

      <LevelDrawer
        open={state.drawerOpen}
        levels={state.levels}
        currentId={level.id}
        progress={state.progress}
        unlockAll={unlockAll}
        onToggleUnlockAll={toggleUnlock}
        onSelect={(id) => void loadLevel(id)}
        onClose={() => dispatch({ type: "toggleDrawer", open: false })}
      />

      <SuccessOverlay
        open={showSuccess}
        title={level.title}
        moves={derived.moves}
        par={level.par}
        stars={progressEntry?.stars ?? 1}
        axiomsOk={view.axiomsOk}
        hasNext={nextLevelId !== null}
        onNext={() => nextLevelId && void loadLevel(nextLevelId)}
        onClose={() => dispatch({ type: "dismissSuccess" })}
      />

    </div>
  );
};
