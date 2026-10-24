import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const libraryFiles = (leanDir: string): string[] => {
  const modules = readdirSync(join(leanDir, "ProofPuzzle"))
    .filter((name) => name.endsWith(".lean"))
    .sort()
    .map((name) => join(leanDir, "ProofPuzzle", name));
  return [join(leanDir, "lean-toolchain"), join(leanDir, "lakefile.lean"), join(leanDir, "ProofPuzzle.lean"), ...modules];
};

export const libraryFingerprint = (leanDir: string, leanVersion: string): string => {
  const hash = createHash("sha256").update(leanVersion);
  for (const file of libraryFiles(leanDir)) hash.update(readFileSync(file));
  return hash.digest("hex");
};
