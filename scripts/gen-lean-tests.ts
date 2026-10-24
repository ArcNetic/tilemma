import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildLeanFile, levelBoards, type Level } from "@pp/engine";
import { loadLevels, rootDir } from "./levels-io.js";

const SECTION_START = ["import ProofPuzzle", "open ProofPuzzle Move Color", "", "set_option maxHeartbeats 200000", "set_option maxRecDepth 2000", ""];

const bodyOf = (source: string): string[] => {
  const lines = source.split("\n");
  return lines.slice(SECTION_START.length);
};

const namespaced = (level: Level): string[] => {
  const name = `solution${level.id}`;
  const file = buildLeanFile(levelBoards(level), level.reference.helpers, level.reference.proof.join("\n"), name);
  return [`namespace ${level.id}`, ...bodyOf(file.source), `end ${level.id}`, ""];
};

const levels = loadLevels();
const output = [...SECTION_START, ...levels.flatMap(namespaced)].join("\n");

writeFileSync(join(rootDir, "lean", "Tests", "LevelSolutions.lean"), output);
console.log(`wrote lean/Tests/LevelSolutions.lean for ${levels.length} levels`);
