import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus.js";
import { highlightLean } from "../lib/leanHighlight.js";
import { CheckIcon, CloseIcon, CopyIcon } from "./icons.js";

export type ShowLeanPanelProps = {
  source: string | undefined;
  open: boolean;
  onClose: () => void;
};

const PROVED: readonly (readonly [string, string])[] = [
  ["perform_rotate_four", "four rotations of a block are the identity"],
  ["perform_paint_idempotent", "painting a block twice equals painting it once"],
  ["applyAll_append", "running xs ++ ys equals running xs, then ys"],
  ["explainIllegal_none_iff", "a move is legal exactly when it has no rule violation"],
  ["Dir.cw_four", "turning a direction clockwise four times returns it"],
];

export const ShowLeanPanel = ({ source, open, onClose }: ShowLeanPanelProps) => {
  const panel = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  useDialogFocus(open, panel, onClose);
  const lines = useMemo(() => (source ? highlightLean(source) : null), [source]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const copy = async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <section ref={panel} className="lean-panel" role="dialog" aria-modal="true" aria-label="Generated Lean file" data-testid="lean-panel" tabIndex={-1}>
        <div className="lean-head">
          <div className="lean-title">
            <h2>Generated Lean</h2>
            <p>The Lean file your moves compile to</p>
          </div>
          <button type="button" className="btn-ghost icon-button" onClick={onClose} aria-label="Close the Lean panel" data-autofocus="">
            <CloseIcon />
          </button>
        </div>
        <p className="lean-note">
          Your moves become tactics. Each one builds a term of <code>Reach</code> using <code>Reach.step … rfl rfl</code>, and the Lean kernel re-checks every step by
          reduction. <code>#print axioms</code> must not mention <code>sorryAx</code>.
        </p>
        <details className="lean-proved" data-testid="lean-proved">
          <summary>Proved in Lean, once and for all</summary>
          <ul>
            {PROVED.map(([name, statement]) => (
              <li key={name}>
                <code>{name}</code>
                <span>{statement}</span>
              </li>
            ))}
          </ul>
          <p>
            These theorems live in <code>ProofPuzzle/Lemmas.lean</code>. The in-browser preview is checked against them with property-based tests, and the Lean kernel
            has the final say on every level.
          </p>
        </details>
        {lines ? (
          <pre className="lean-source" tabIndex={0} role="region" aria-label="Lean source">
            <code>{lines}</code>
          </pre>
        ) : (
          <p className="lean-empty">Run a proof to see the file Lean checked.</p>
        )}
        <div className="lean-foot">
          <span className="lean-file">{source ? `${source.trim().split(/\r?\n/).length} lines` : "No file yet"}</span>
          <button type="button" className="primary" onClick={copy} disabled={!source}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy file"}
          </button>
        </div>
      </section>
    </>
  );
};
