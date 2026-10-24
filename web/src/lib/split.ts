export const SPLIT_X_KEY = "tilemma-split-x-board-left";
export const SPLIT_Y_KEY = "tilemma-split-y";
export const DEFAULT_SPLIT_X = 58;
export const DEFAULT_SPLIT_Y = 40;
export const SPLIT_MIN = 15;
export const SPLIT_MAX = 85;

/** Width taken by a divider, in px. Must match `--splitter` in layout.css. */
export const SPLITTER_PX = 12;

export const clampRatio = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

export const readRatio = (key: string, fallback: number, lo: number, hi: number): number => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? clampRatio(parsed, lo, hi) : fallback;
  } catch {
    return fallback;
  }
};

export const writeRatio = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(Math.round(value * 10) / 10));
  } catch {
    return;
  }
};

/**
 * Allowed range, as percentages of `total` px, for the first of two panes that must each
 * keep a minimum size. `gap` is the divider itself.
 */
export const ratioBounds = (total: number, minFirstPx: number, minSecondPx: number, gap: number): { lo: number; hi: number } => {
  if (total <= 0) return { lo: SPLIT_MIN, hi: SPLIT_MAX };
  const lo = (minFirstPx / total) * 100;
  const hi = 100 - ((minSecondPx + gap) / total) * 100;
  return hi >= lo ? { lo, hi } : { lo: 50, hi: 50 };
};

/** Percentage of the container covered by the pointer, measured from the container start. */
export const ratioFromPointer = (pointer: number, start: number, total: number, grabOffset: number): number =>
  total <= 0 ? 50 : ((pointer - start - grabOffset) / total) * 100;
