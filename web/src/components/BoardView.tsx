import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { parseCode, type CodeBoard } from "@pp/engine";
import { describeCell, ghostFor, insideCells, outsideCells } from "../lib/cellInfo.js";
import { angleOf, type Tracked } from "../lib/identity.js";
import { CheckIcon } from "./icons.js";

export type BadgeTone = "neutral" | "working" | "verified";

export type BoardViewProps = {
  title: string;
  board: CodeBoard;
  tracked?: Tracked;
  errorCells?: readonly (readonly [number, number])[];
  mismatchCells?: readonly (readonly [number, number])[];
  badge?: string;
  /** neutral: a preview. working: Lean is checking. verified: Lean confirmed this board. */
  badgeTone?: BadgeTone;
  /** The proof is solved and verified: the board glows and its tiles pulse once. */
  solved?: boolean;
  onCellClick?: (row: number, col: number) => void;
  testId?: string;
  /** "inset" is the small reference card that sits inside the stage. */
  variant?: "main" | "inset";
};

type Hot = readonly [number, number] | null;

const ARROW_PATH = "M12 3 L19 13 H14 V21 H10 V13 H5 Z";

/** How long a tile stays lifted while it travels to its new slot. */
const LIFT_MS = 420;
/** How long the verified stamp and the board glow last. */
const STAMP_MS = 900;

const hasCell = (cells: readonly (readonly [number, number])[] | undefined, r: number, c: number): boolean =>
  cells?.some(([cr, cc]) => cr === r && cc === c) ?? false;

const LockIcon = () => (
  <svg className="lock" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" strokeWidth="2.4" />
  </svg>
);

const ErrorChip = () => (
  <span className="cell-flag cell-flag-error" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  </span>
);

const DiffChip = () => (
  <>
    <span className="cell-ring" aria-hidden="true" />
    <span className="cell-flag cell-flag-diff" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M6 9h12M6 15h12M16.5 5L7.5 19" />
      </svg>
    </span>
  </>
);

type CellProps = {
  code: string;
  row: number;
  col: number;
  rotation: number;
  error: boolean;
  mismatch: boolean;
  clickable: boolean;
  onClick?: (row: number, col: number) => void;
  onHot: (cell: Hot) => void;
  instant: boolean;
};

const BoardCell = ({ code, row, col, rotation, error, mismatch, clickable, onClick, onHot, instant }: CellProps) => {
  const cell = parseCode(code);
  const label = describeCell(code, row, col);

  // Paint: the old colour (and its pattern) shrinks away from the edges to the centre, revealing the new one.
  const [ink, setInk] = useState<{ color: string; id: number } | null>(null);
  const lastColor = useRef(cell.color);
  const inkCount = useRef(0);
  useEffect(() => {
    if (lastColor.current === cell.color) return;
    const previous = lastColor.current;
    lastColor.current = cell.color;
    if (!instant) {
      inkCount.current += 1;
      setInk({ color: previous, id: inkCount.current });
    }
  }, [cell.color, instant]);

  // Swap: while the tile travels to its new slot it is lifted, so tiles visibly pass over each other.
  const [moving, setMoving] = useState(false);
  const lastSlot = useRef(`${row},${col}`);
  useEffect(() => {
    const slot = `${row},${col}`;
    if (lastSlot.current === slot) return;
    lastSlot.current = slot;
    if (instant) return;
    setMoving(true);
    const timer = setTimeout(() => setMoving(false), LIFT_MS);
    return () => clearTimeout(timer);
  }, [row, col, instant]);

  const classes = [
    "cell",
    `color-${cell.color}`,
    cell.locked ? "cell-locked" : "",
    moving ? "cell-moving" : "",
    error ? "cell-error" : "",
    mismatch ? "cell-mismatch" : "",
    clickable ? "cell-clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const transition = instant ? { duration: 0 } : { type: "spring" as const, stiffness: 520, damping: 38 };
  // A quarter turn with a little overshoot, like a tile settling.
  const turn = instant ? { duration: 0 } : { type: "spring" as const, stiffness: 360, damping: 17 };
  return (
    <motion.div
      layout
      className={classes}
      style={{ gridRow: row + 1, gridColumn: col + 1, "--wave": row + col } as CSSProperties}
      transition={transition}
      role={clickable ? "button" : "img"}
      tabIndex={clickable ? 0 : undefined}
      aria-label={label}
      data-code={code}
      data-row={row}
      data-col={col}
      data-coord={`(${row}, ${col})`}
      onClick={clickable ? () => onClick?.(row, col) : undefined}
      onPointerEnter={() => onHot([row, col])}
      onPointerLeave={() => onHot(null)}
      onFocus={() => onHot([row, col])}
      onBlur={() => onHot(null)}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.(row, col);
              }
            }
          : undefined
      }
    >
      {ink && <span key={ink.id} className={`cell-ink color-${ink.color}`} aria-hidden="true" onAnimationEnd={() => setInk(null)} />}
      <span className="cell-letter" aria-hidden="true">
        {cell.color}
      </span>
      {cell.dir !== "." && (
        <motion.svg className="arrow" viewBox="0 0 24 24" aria-hidden="true" animate={{ rotate: rotation }} transition={turn}>
          <path d={ARROW_PATH} />
        </motion.svg>
      )}
      {cell.locked && <LockIcon />}
      {error && <ErrorChip />}
      {mismatch && <DiffChip />}
    </motion.div>
  );
};

export const BoardView = ({ title, board, tracked, errorCells, mismatchCells, badge, badgeTone = "neutral", solved = false, onCellClick, testId, variant = "main" }: BoardViewProps) => {
  const reduceMotion = useReducedMotion() ?? false;
  const [hot, setHot] = useState<Hot>(null);

  // The moment Lean confirms a board: the badge is stamped, and a clean board gets a brief green glow.
  const [stamp, setStamp] = useState(false);
  const lastTone = useRef(badgeTone);
  useEffect(() => {
    const was = lastTone.current;
    lastTone.current = badgeTone;
    if (badgeTone !== "verified" || was === "verified" || reduceMotion) return;
    setStamp(true);
    const timer = setTimeout(() => setStamp(false), STAMP_MS);
    return () => clearTimeout(timer);
  }, [badgeTone, reduceMotion]);

  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const inside = insideCells(errorCells ?? [], rows, cols);
  const ghosts = outsideCells(errorCells ?? [], rows, cols).map((cell) => ({ ghost: ghostFor(cell, rows, cols), coord: `(${cell[0]}, ${cell[1]})` }));
  const clean = (errorCells?.length ?? 0) === 0;

  const entries = board.flatMap((line, r) =>
    line.map((code, c) => ({
      code,
      r,
      c,
      id: tracked?.ids[r]?.[c] ?? r * cols + c,
      rotation: tracked?.rotations[r]?.[c] ?? angleOf(code) ?? 0,
    })),
  );

  const panelClasses = ["board-panel", variant === "inset" ? "board-inset" : "", solved ? "board-solved" : "", stamp && clean ? "verify-flash" : ""].filter(Boolean).join(" ");

  return (
    <section className={panelClasses} aria-label={title} data-testid={testId} style={{ "--cols": cols, "--rows": rows } as CSSProperties}>
      <header className="board-header">
        <h2>{title}</h2>
        {badge && (
          <span className={`badge badge-${badgeTone}${stamp ? " badge-stamp" : ""}`}>
            {badgeTone === "verified" && <CheckIcon />}
            {badgeTone === "working" && <span className="badge-spinner" aria-hidden="true" />}
            {badge}
          </span>
        )}
      </header>
      <div className="board-frame">
        <div className="col-labels" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className={hot?.[1] === c ? "on" : undefined}>
              {c}
            </span>
          ))}
        </div>
        <div className="board-row">
          <div className="row-labels" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: rows }, (_, r) => (
              <span key={r} className={hot?.[0] === r ? "on" : undefined}>
                {r}
              </span>
            ))}
          </div>
          <div className="board-grid" role="group" aria-label={`${title} blocks`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
            {entries.map((entry) => (
              <span key={`slot-${entry.r}-${entry.c}`} className="slot" aria-hidden="true" style={{ gridRow: entry.r + 1, gridColumn: entry.c + 1 }} />
            ))}
            {entries.map((entry) => (
              <BoardCell
                key={entry.id}
                code={entry.code}
                row={entry.r}
                col={entry.c}
                rotation={entry.rotation}
                error={hasCell(inside, entry.r, entry.c)}
                mismatch={hasCell(mismatchCells, entry.r, entry.c)}
                clickable={onCellClick !== undefined}
                onClick={onCellClick}
                onHot={setHot}
                instant={reduceMotion}
              />
            ))}
            {ghosts.map(({ ghost, coord }, index) => (
              <div
                key={`ghost-${index}`}
                className={`ghost ghost-${ghost.side}`}
                style={{ "--ghost-row": ghost.row, "--ghost-col": ghost.col } as CSSProperties}
                role="img"
                aria-label={ghost.label}
                title={ghost.label}
              >
                <span aria-hidden="true">{coord}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
