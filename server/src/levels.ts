import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LevelSchema, type Level } from "@pp/engine";

const here = dirname(fileURLToPath(import.meta.url));

export const defaultLevelsDir = (): string => process.env.LEVELS_DIR ?? join(here, "..", "..", "levels");

export const loadLevelsFrom = (dir: string): Level[] =>
  readdirSync(dir)
    .filter((name) => /^L\d{2}\.json$/.test(name))
    .sort()
    .map((name) => LevelSchema.parse(JSON.parse(readFileSync(join(dir, name), "utf8"))));

export type LevelCatalog = {
  all: Level[];
  byId: (id: string) => Level | undefined;
};

export const createCatalog = (dir = defaultLevelsDir()): LevelCatalog => {
  const all = loadLevelsFrom(dir);
  const index = new Map(all.map((level) => [level.id, level]));
  return { all, byId: (id) => index.get(id) };
};
