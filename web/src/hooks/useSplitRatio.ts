import { useCallback, useState } from "react";
import { clampRatio, readRatio, writeRatio } from "../lib/split.js";

export type SplitRatio = {
  value: number;
  /** Live update while dragging; not saved. */
  preview: (next: number) => void;
  /** Update and save. */
  commit: (next: number) => void;
  reset: () => void;
};

export const useSplitRatio = (key: string, fallback: number, lo: number, hi: number): SplitRatio => {
  const [value, setValue] = useState(() => readRatio(key, fallback, lo, hi));
  const preview = useCallback((next: number) => setValue(clampRatio(next, lo, hi)), [lo, hi]);
  const commit = useCallback(
    (next: number) => {
      const clamped = clampRatio(next, lo, hi);
      setValue(clamped);
      writeRatio(key, clamped);
    },
    [key, lo, hi],
  );
  const reset = useCallback(() => commit(fallback), [commit, fallback]);
  return { value, preview, commit, reset };
};
