import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export type RunOutcome = {
  lines: string[];
  timedOut: boolean;
  outputTruncated: boolean;
  exitCode: number | null;
  ms: number;
};

export interface LeanRunner {
  readonly kind: "cold" | "warm";
  run(source: string): Promise<RunOutcome>;
  version(): Promise<string>;
  isWarm(): boolean;
  shutdown?(): void;
}

export type ColdRunnerOptions = {
  leanDir: string;
  leanBin: string;
  timeoutMs: number;
  maxOutputBytes: number;
  memoryLimitMb?: number;
  extraArgs?: string[];
};

const killTree = (pid: number | undefined): void => {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGKILL");
  } catch {
    return;
  }
};

const elanCandidates = (): string[] => [
  "elan",
  join(process.env.ELAN_HOME ?? join(homedir(), ".elan"), "bin", process.platform === "win32" ? "elan.exe" : "elan"),
];

export const resolveLeanBinary = (leanDir: string): string => {
  if (process.env.LEAN_BIN) return process.env.LEAN_BIN;
  for (const elan of elanCandidates()) {
    try {
      return execFileSync(elan, ["which", "lean"], { cwd: leanDir, encoding: "utf8" }).trim();
    } catch {
      continue;
    }
  }
  return "lean";
};

export const libraryPath = (leanDir: string): string => join(leanDir, ".lake", "build", "lib", "lean");

export class ColdRunner implements LeanRunner {
  readonly kind = "cold" as const;
  private cachedVersion: string | undefined;
  private warmed = false;

  constructor(private readonly options: ColdRunnerOptions) {
    if (!existsSync(libraryPath(options.leanDir))) {
      throw new Error(`Lean library not built: ${libraryPath(options.leanDir)} is missing. Run "lake build" in ${options.leanDir}`);
    }
  }

  isWarm(): boolean {
    return this.warmed;
  }

  async version(): Promise<string> {
    if (!this.cachedVersion) {
      const out = execFileSync(this.options.leanBin, ["--version"], { encoding: "utf8" });
      this.cachedVersion = /version ([^\s,]+)/.exec(out)?.[1] ?? out.trim();
    }
    return this.cachedVersion;
  }

  run(source: string): Promise<RunOutcome> {
    const workDir = join(tmpdir(), "pp-checks", randomUUID());
    mkdirSync(workDir, { recursive: true });
    const file = join(workDir, "Check.lean");
    writeFileSync(file, source, "utf8");
    return this.execute(file, workDir).finally(() => {
      this.warmed = true;
      rmSync(workDir, { recursive: true, force: true });
    });
  }

  private execute(file: string, workDir: string): Promise<RunOutcome> {
    const { leanBin, leanDir, timeoutMs, maxOutputBytes, memoryLimitMb, extraArgs = [] } = this.options;
    const started = performance.now();
    const wrapped = memoryLimitMb && process.platform === "linux";
    const command = wrapped ? "prlimit" : leanBin;
    const leanArgs = [...extraArgs, "--json", file];
    const args = wrapped ? [`--as=${memoryLimitMb * 1024 * 1024}`, leanBin, ...leanArgs] : leanArgs;
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: workDir,
        env: { ...process.env, LEAN_PATH: libraryPath(leanDir) + delimiter + (process.env.LEAN_PATH ?? "") },
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let timedOut = false;
      let outputTruncated = false;
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxOutputBytes) {
          outputTruncated = true;
          killTree(child.pid);
          return;
        }
        chunks.push(chunk);
      });
      const finish = (exitCode: number | null) => {
        clearTimeout(timer);
        if (timedOut || outputTruncated || process.platform !== "win32") killTree(child.pid);
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          lines: text.split("\n").filter((line) => line.trim() !== ""),
          timedOut,
          outputTruncated,
          exitCode,
          ms: Math.round(performance.now() - started),
        });
      };
      child.on("error", () => finish(null));
      child.on("close", (code) => finish(code));
    });
  }
}
