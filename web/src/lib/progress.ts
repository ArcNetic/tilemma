import { z } from "zod";

const STORAGE_KEY = "tilemma-progress-v1";

const ProgressSchema = z.record(z.object({ best: z.number().int().positive(), stars: z.number().int().min(1).max(3) }));

export type Progress = z.infer<typeof ProgressSchema>;

export const loadProgress = (storage: Pick<Storage, "getItem"> | undefined = safeStorage()): Progress => {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = ProgressSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

export const saveProgress = (progress: Progress, storage: Pick<Storage, "setItem"> | undefined = safeStorage()): void => {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    return;
  }
};

export const starsFor = (moves: number, par: number): 1 | 2 | 3 => (moves <= par ? 3 : moves <= par + 1 ? 2 : 1);

export const recordSolve = (progress: Progress, levelId: string, moves: number, par: number): Progress => {
  const stars = starsFor(moves, par);
  const previous = progress[levelId];
  const best = previous ? Math.min(previous.best, moves) : moves;
  return { ...progress, [levelId]: { best, stars: Math.max(stars, previous?.stars ?? 1) as 1 | 2 | 3 } };
};

export const isUnlocked = (progress: Progress, order: number, orderedIds: readonly string[]): boolean =>
  order <= 1 || progress[orderedIds[order - 2] ?? ""] !== undefined;

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
