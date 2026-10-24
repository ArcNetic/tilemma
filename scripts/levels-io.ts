import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LevelSchema, type Level } from "@pp/engine";

export const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export const levelsDir = join(rootDir, "levels");

export const loadLevels = (): Level[] =>
  readdirSync(levelsDir)
    .filter((name) => /^L\d{2}\.json$/.test(name))
    .sort()
    .map((name) => LevelSchema.parse(JSON.parse(readFileSync(join(levelsDir, name), "utf8"))));
