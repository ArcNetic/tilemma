import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLeanFile, levelBoards } from "@pp/engine";
import { createRuntime } from "../src/runtime.js";

type Recipe = { name: string; levelId: string; helpers: string; proof: string };

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "test", "fixtures");

const CCW = "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))";

const recipes: Recipe[] = [
  { name: "solved", levelId: "L01", helpers: "", proof: "swap (0, 0) (0, 1)\nswap (1, 0) (1, 1)" },
  { name: "illegal-locked", levelId: "L05", helpers: "", proof: "swap (0, 0) (0, 2)\nswap (0, 0) (0, 1)\nrotate (1, 1)" },
  { name: "incomplete", levelId: "L01", helpers: "", proof: "swap (0, 0) (0, 1)" },
  { name: "extra-moves", levelId: "L01", helpers: "", proof: "swap (0, 0) (0, 1)\nswap (1, 0) (1, 1)\nswap (0, 0) (0, 1)" },
  { name: "helper-solved", levelId: "L10", helpers: CCW, proof: "run ccw 0 0\nrun ccw 1 1\nrun ccw 2 2" },
  {
    name: "helper-illegal-substep",
    levelId: "L10",
    helpers: "def bad (r c : Nat) : List Move := [.rotate (r, c), .rotate (r, 1)]",
    proof: "run bad 0 0",
  },
  { name: "helper-type-error", levelId: "L08", helpers: "def broken : List Move := [.rotate 5]", proof: "run broken" },
  {
    name: "helper-too-long",
    levelId: "L08",
    helpers: "def big : List Move := List.flatten (List.map (fun i => List.replicate 99 (.rotate (i, i))) (List.range 99))",
    proof: "run big",
  },
  { name: "comments-and-blanks", levelId: "L01", helpers: "", proof: "-- plan\n  swap (0, 0) (0, 1)\n\n-- next\nswap (1, 0) (1, 1)" },
];

const runtime = await createRuntime();
mkdirSync(outDir, { recursive: true });

for (const recipe of recipes) {
  const level = runtime.catalog.byId(recipe.levelId)!;
  const file = buildLeanFile(levelBoards(level), recipe.helpers, recipe.proof, "puzzle");
  const outcome = await runtime.runner.run(file.source);
  const fixture = { ...recipe, lines: outcome.lines };
  writeFileSync(join(outDir, `${recipe.name}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`recorded ${recipe.name}: ${outcome.lines.length} messages in ${outcome.ms} ms`);
}

await runtime.app.close();
