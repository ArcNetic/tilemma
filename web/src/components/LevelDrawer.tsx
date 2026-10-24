import { useRef } from "react";
import type { LevelSummary } from "@pp/engine";
import { useDialogFocus } from "../hooks/useDialogFocus.js";
import { isUnlocked, type Progress } from "../lib/progress.js";
import { CheckIcon, LockIcon, StarIcon } from "./icons.js";

export type LevelDrawerProps = {
  open: boolean;
  levels: readonly LevelSummary[];
  currentId: string | null;
  progress: Progress;
  unlockAll: boolean;
  onToggleUnlockAll: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
};

const Stars = ({ count }: { count: number }) => (
  <span className="mini-stars" role="img" aria-label={count === 0 ? "not solved" : `${count} stars`}>
    {[1, 2, 3].map((n) => (
      <span key={n} className={n <= count ? "on" : ""} aria-hidden="true">
        <StarIcon />
      </span>
    ))}
  </span>
);

export const LevelDrawer = ({ open, levels, currentId, progress, unlockAll, onToggleUnlockAll, onSelect, onClose }: LevelDrawerProps) => {
  const drawer = useRef<HTMLElement>(null);
  useDialogFocus(open, drawer, onClose);
  const ids = levels.map((l) => l.id);
  const solved = levels.filter((l) => progress[l.id] !== undefined).length;
  const stars = levels.reduce((sum, l) => sum + (progress[l.id]?.stars ?? 0), 0);

  return (
    <>
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}
      <nav ref={drawer} id="level-drawer" className={open ? "drawer open" : "drawer"} aria-label="Levels" aria-hidden={!open} data-testid="level-drawer" tabIndex={open ? -1 : undefined}>
        <header>
          <button type="button" className="menu-toggle btn-ghost" onClick={onClose} aria-label="Close levels" tabIndex={open ? 0 : -1}>
            <span className={open ? "burger is-open" : "burger"} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
          <h2>Levels</h2>
        </header>
        <p className="drawer-summary">
          {solved} of {levels.length} solved
          <span aria-hidden="true"> · </span>
          <span className="drawer-stars">
            {stars} <StarIcon aria-hidden="true" />
          </span>
          <span className="visually-hidden">, {stars} stars in total</span>
        </p>
        <ol>
          {levels.map((level) => {
            const unlocked = unlockAll || isUnlocked(progress, level.order, ids);
            const entry = progress[level.id];
            const current = level.id === currentId;
            return (
              <li key={level.id}>
                <button
                  type="button"
                  className={["level-item", current ? "current" : "", entry ? "solved" : "", unlocked ? "" : "locked"].filter(Boolean).join(" ")}
                  disabled={!unlocked}
                  tabIndex={open ? 0 : -1}
                  aria-current={current ? "true" : undefined}
                  data-autofocus={current ? "" : undefined}
                  onClick={() => onSelect(level.id)}
                >
                  <span className="level-order">{level.order}</span>
                  <span className="level-text">
                    <strong>{level.title}</strong>
                    <small>
                      {unlocked ? level.concept : "Locked"} · Goal: {level.par}
                      {entry ? ` · Best: ${entry.best}` : ""}
                    </small>
                  </span>
                  <span className="level-state">
                    {!unlocked ? <LockIcon aria-label="Locked" role="img" /> : entry ? <CheckIcon aria-label="Solved" role="img" /> : null}
                  </span>
                  <Stars count={entry?.stars ?? 0} />
                </button>
              </li>
            );
          })}
        </ol>
        <label className="unlock-toggle">
          <input type="checkbox" checked={unlockAll} onChange={onToggleUnlockAll} tabIndex={open ? 0 : -1} />
          Demo mode: unlock all levels
        </label>
      </nav>
    </>
  );
};
