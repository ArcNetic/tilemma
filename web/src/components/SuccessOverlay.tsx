import { useRef, type CSSProperties } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus.js";
import { CheckIcon, StarIcon } from "./icons.js";

export type SuccessOverlayProps = {
  open: boolean;
  title: string;
  moves: number;
  par: number;
  stars: number;
  axiomsOk: boolean | null;
  hasNext: boolean;
  onNext: () => void;
  onClose: () => void;
};

const COLORS = ["R", "G", "B", "Y", "P", "O", "W", "K"] as const;
const SHAPES = ["strip", "square", "dot"] as const;

export type ConfettiPiece = {
  id: number;
  color: (typeof COLORS)[number];
  shape: (typeof SHAPES)[number];
  /** Start position across the screen, in percent. */
  x: number;
  /** Sideways drift while falling, in px. */
  dx: number;
  /** Turn while falling, in degrees. */
  rot: number;
  /** Fall time and start delay, in seconds. */
  dur: number;
  delay: number;
  size: number;
};

/** A fixed pseudo-random set, so the confetti is the same every time and render stays pure. */
export const makeConfetti = (count: number): ConfettiPiece[] => {
  let seed = 20260;
  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, id) => ({
    id,
    color: COLORS[id % COLORS.length]!,
    shape: SHAPES[Math.floor(next() * SHAPES.length)]!,
    x: Math.round(next() * 1000) / 10,
    dx: Math.round((next() - 0.5) * 220),
    rot: Math.round((next() < 0.5 ? -1 : 1) * (360 + next() * 540)),
    dur: Math.round((1.6 + next() * 0.9) * 100) / 100,
    delay: Math.round(next() * 0.55 * 100) / 100,
    size: Math.round(7 + next() * 7),
  }));
};

const PIECES = makeConfetti(56);

export const SuccessOverlay = ({ open, title, moves, par, stars, axiomsOk, hasNext, onNext, onClose }: SuccessOverlayProps) => {
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialog, onClose);

  if (!open) return null;

  return (
    <div className="overlay" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Level cleared" data-testid="success-overlay">
      <div className="confetti" aria-hidden="true">
        {PIECES.map((p) => (
          <span
            key={p.id}
            className={`piece piece-${p.shape} color-${p.color}`}
            style={
              {
                left: `${p.x}%`,
                width: p.shape === "strip" ? p.size * 0.5 : p.size,
                height: p.shape === "strip" ? p.size * 1.6 : p.size,
                "--dx": `${p.dx}px`,
                "--rot": `${p.rot}deg`,
                "--dur": `${p.dur}s`,
                "--delay": `${p.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="success-card">
        <h2>Level cleared</h2>
        <p className="success-title">{title}</p>
        <div className="stars" role="img" aria-label={`${stars} of 3 stars`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= stars ? "star on" : "star"} style={{ "--i": n - 1 } as CSSProperties} aria-hidden="true">
              <StarIcon />
            </span>
          ))}
        </div>
        <p className="success-moves">
          {moves} {moves === 1 ? "line" : "lines"} · goal {par}
        </p>
        <p className="verified-badge" data-testid="verified-badge">
          <CheckIcon />
          <span>Verified by the Lean kernel</span>
          {axiomsOk ? (
            <>
              {" "}
              <small>(no sorry, no extra axioms)</small>
            </>
          ) : null}
        </p>
        <div className="success-actions">
          {hasNext && (
            <button type="button" className="primary" onClick={onNext} data-autofocus="">
              Next level
            </button>
          )}
          <button type="button" onClick={onClose} data-autofocus={hasNext ? undefined : ""}>
            Keep looking
          </button>
        </div>
      </div>
    </div>
  );
};
