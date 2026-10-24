import { execFileSync } from "node:child_process";
import type { Level } from "@pp/engine";

export const leanProcessCount = (): number => {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq lean.exe", "/FO", "CSV", "/NH"], { encoding: "utf8" });
      return out.split("\n").filter((line) => line.toLowerCase().includes("lean.exe")).length;
    }
    const out = execFileSync("pgrep", ["-x", "lean"], { encoding: "utf8" });
    return out.split("\n").filter((line) => line.trim() !== "").length;
  } catch {
    return 0;
  }
};

export const referenceRequest = (level: Level) => ({
  levelId: level.id,
  helpers: level.reference.helpers,
  proof: level.reference.proof.join("\n"),
});
