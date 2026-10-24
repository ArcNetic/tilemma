import { CodeIcon } from "./icons.js";

export type EditorActionsProps = {
  onHint: () => void;
  onReset: () => void;
  onShowLean?: () => void;
  leanOpen?: boolean;
  hintShown: boolean;
  checking?: boolean;
};

export const EditorActions = ({ onHint, onReset, onShowLean, leanOpen = false, hintShown, checking = false }: EditorActionsProps) => (
  <div className="editor-actions" role="toolbar" aria-label="Level actions">
    {onShowLean && (
      <button type="button" className="lean-cta" onClick={onShowLean} aria-pressed={leanOpen} title="See the Lean code your moves turn into">
        <CodeIcon />
        Show Lean
      </button>
    )}
    <button type="button" className="secondary" onClick={onHint} aria-pressed={hintShown}>
      Hint
    </button>
    <span className="check-state" role="status" aria-busy={checking || undefined}>
      {checking && <span className="run-spinner" aria-hidden="true" />}
      {checking ? "Checking with Lean..." : "Checks automatically as you type"}
    </span>
    <button type="button" className="destructive reset-button" onClick={onReset}>
      Reset
    </button>
  </div>
);
