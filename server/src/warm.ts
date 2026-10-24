import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { z } from "zod";
import { libraryPath, type LeanRunner, type RunOutcome } from "./runner.js";

const ReplMessageSchema = z.object({
  severity: z.enum(["info", "information", "warning", "error"]),
  data: z.string(),
  pos: z.object({ line: z.number().int(), column: z.number().int() }),
  endPos: z.object({ line: z.number().int(), column: z.number().int() }).nullable().optional(),
});

const ReplResponseSchema = z.object({
  messages: z.array(ReplMessageSchema).default([]),
  message: z.string().optional(),
});

export const normalizeReplResponse = (response: unknown): string[] | undefined => {
  const parsed = ReplResponseSchema.safeParse(response);
  if (!parsed.success) return undefined;
  return parsed.data.messages.map((m) =>
    JSON.stringify({
      severity: m.severity === "info" ? "information" : m.severity,
      data: m.data,
      pos: m.pos,
      endPos: m.endPos ?? null,
    }),
  );
};

export const replBinary = (repoRoot: string): string =>
  process.env.REPL_BIN ?? join(repoRoot, ".repl", ".lake", "build", "bin", process.platform === "win32" ? "repl.exe" : "repl");

export type WarmRunnerOptions = {
  leanDir: string;
  leanBin: string;
  replBin: string;
  workers: number;
  timeoutMs: number;
  recycleAfter: number;
  maxOutputBytes: number;
  /** How long a worker may take to answer its first command (importing the library). */
  startupTimeoutMs?: number;
  /** Extra arguments and environment for the REPL process. Only tests need these, to run a stand-in REPL. */
  replArgs?: string[];
  replEnv?: Record<string, string>;
};

type WorkerOptions = WarmRunnerOptions & { binDir?: string };

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

const DELIMITER = /\r?\n\r?\n/;

const killTree = (pid: number | undefined): void => {
  if (pid === undefined) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGKILL");
  } catch {
    return;
  }
};

/** Formats a time limit for messages, for example "400 ms" or "120 s". */
export const durationText = (ms: number): string => (ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`);

const WINDOWS_DLL_NOT_FOUND = 3221225781; // exit code 0xC0000135

/** A plain-English reason for a REPL process that stopped, including what it wrote to stderr. */
export const describeExit = (code: number | null, signal: NodeJS.Signals | null, stderr: string): string => {
  const text = stderr.trim();
  const detail = text ? `: ${text.slice(-300)}` : "";
  if (code === WINDOWS_DLL_NOT_FOUND || /libleanshared|cannot open shared object/i.test(text)) {
    return `the REPL could not load the Lean shared library, so the toolchain's bin directory must be on PATH${detail}`;
  }
  if (code !== null) return `the REPL exited with code ${code}${detail}`;
  return `the REPL was stopped by ${signal ?? "a signal"}${detail}`;
};

/**
 * The directory with the toolchain's executables and, on Windows, the DLLs the REPL loads when it starts.
 * Asking Lean for its prefix also works when `leanBin` is only a launcher (an elan proxy, or a bare `lean`).
 */
export const leanBinDir = (leanBin: string, cwd: string): string => {
  try {
    const prefix = execFileSync(leanBin, ["--print-prefix"], { cwd, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const bin = join(prefix, "bin");
    if (prefix !== "" && existsSync(bin)) return bin;
  } catch {
    // Fall back to the directory of the binary itself.
  }
  return dirname(leanBin);
};

class ReplWorker {
  private child: ChildProcessWithoutNullStreams | undefined;
  private buffer = "";
  private pending: Pending | undefined;
  checks = 0;
  busy = false;
  ready: Promise<boolean> = Promise.resolve(false);
  alive = false;
  /** Why the last start did not succeed. */
  failure: string | undefined;

  constructor(private readonly options: WorkerOptions) {}

  start(): Promise<boolean> {
    this.dispose();
    this.checks = 0;
    this.buffer = "";
    this.failure = undefined;
    const { leanBin, leanDir, replBin } = this.options;
    const startupMs = this.options.startupTimeoutMs ?? 20_000;
    let stderr = "";
    let stopped: string | undefined;
    const child = spawn(replBin, this.options.replArgs ?? [], {
      cwd: leanDir,
      env: {
        ...process.env,
        ...this.options.replEnv,
        PATH: (this.options.binDir ?? dirname(leanBin)) + delimiter + (process.env.PATH ?? ""),
        LEAN_PATH: libraryPath(leanDir) + delimiter + (process.env.LEAN_PATH ?? ""),
      },
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-2000);
    });
    child.on("error", (error) => {
      stopped = `could not start the REPL: ${error.message}`;
      this.fail(child, new Error("repl failed to start"));
    });
    child.on("exit", (code, signal) => {
      stopped = describeExit(code, signal, stderr);
      this.fail(child, new Error("repl exited"));
    });
    this.alive = true;
    this.ready = this.request({ cmd: "import ProofPuzzle" }, startupMs).then(
      (response) => {
        const ok = (response as { env?: number }).env === 0;
        if (!ok) this.failure = `unexpected reply to the library import: ${JSON.stringify(response).slice(0, 200)}`;
        return ok;
      },
      (error: Error) => {
        this.failure =
          error.message === "repl timeout"
            ? `no answer to the library import within ${durationText(startupMs)} (the first load can be slow while the operating system has not cached the Lean files yet; WARM_STARTUP_MS raises the limit)`
            : (stopped ?? error.message);
        return false;
      },
    );
    this.ready.then((ok) => {
      if (!ok && this.child === child) this.dispose();
    });
    return this.ready;
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    if (this.buffer.length > this.options.maxOutputBytes) {
      this.fail(this.child, new Error("repl output too large"));
      return;
    }
    let from = 0;
    for (;;) {
      const match = DELIMITER.exec(this.buffer.slice(from));
      if (!match) return;
      const end = from + match.index;
      const consumed = end + match[0].length;
      let parsed: unknown;
      try {
        parsed = JSON.parse(this.buffer.slice(0, end));
      } catch {
        from = consumed;
        continue;
      }
      this.buffer = this.buffer.slice(consumed);
      from = 0;
      const waiting = this.pending;
      this.pending = undefined;
      if (waiting) {
        clearTimeout(waiting.timer);
        waiting.resolve(parsed);
      }
    }
  }

  private fail(child: ChildProcessWithoutNullStreams | undefined, error: Error): void {
    if (child !== this.child) return;
    const waiting = this.pending;
    this.pending = undefined;
    this.alive = false;
    if (waiting) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    killTree(child?.pid);
  }

  request(payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = this.child;
      if (!child || !this.alive) {
        reject(new Error("repl not running"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending = undefined;
        reject(new Error("repl timeout"));
      }, timeoutMs);
      this.pending = { resolve, reject, timer };
      child.stdin.write(`${JSON.stringify(payload)}\n\n`, (error) => {
        if (error) this.fail(child, error);
      });
    });
  }

  dispose(): void {
    const child = this.child;
    this.child = undefined;
    this.alive = false;
    const waiting = this.pending;
    this.pending = undefined;
    if (waiting) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error("repl disposed"));
    }
    if (child) killTree(child.pid);
  }
}

export class WarmRunner implements LeanRunner {
  readonly kind = "warm" as const;
  private readonly workers: ReplWorker[];
  private readonly waiting: ((worker: ReplWorker) => void)[] = [];
  private cachedVersion: string | undefined;

  constructor(private readonly options: WarmRunnerOptions) {
    if (!existsSync(options.replBin)) throw new Error(`Lean REPL not built: ${options.replBin} is missing`);
    const workerOptions: WorkerOptions = { ...options, binDir: leanBinDir(options.leanBin, options.leanDir) };
    this.workers = Array.from({ length: options.workers }, () => new ReplWorker(workerOptions));
  }

  async warmUp(): Promise<boolean> {
    const results = await Promise.all(this.workers.map((w) => w.start()));
    return results.every(Boolean);
  }

  /** Why the last attempt to start the workers failed, if it did. */
  lastFailure(): string | undefined {
    return this.workers.map((w) => w.failure).find((f) => f !== undefined);
  }

  isWarm(): boolean {
    return this.workers.some((w) => w.alive);
  }

  async version(): Promise<string> {
    if (!this.cachedVersion) {
      const out = execFileSync(this.options.leanBin, ["--version"], { encoding: "utf8" });
      this.cachedVersion = /version ([^\s,]+)/.exec(out)?.[1] ?? out.trim();
    }
    return this.cachedVersion;
  }

  shutdown(): void {
    for (const worker of this.workers) worker.dispose();
  }

  private acquire(): Promise<ReplWorker> {
    const idle = this.workers.find((w) => !w.busy);
    if (idle) {
      idle.busy = true;
      return Promise.resolve(idle);
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(worker: ReplWorker): void {
    const next = this.waiting.shift();
    if (next) next(worker);
    else worker.busy = false;
  }

  private async ensureReady(worker: ReplWorker): Promise<boolean> {
    if (worker.alive && (await worker.ready)) return true;
    return worker.start();
  }

  async run(source: string): Promise<RunOutcome> {
    const started = performance.now();
    const worker = await this.acquire();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!(await this.ensureReady(worker))) continue;
        try {
          const command = source.replace(/^import ProofPuzzle[^\n]*/, "");
          const response = await worker.request({ cmd: command, env: 0 }, this.options.timeoutMs);
          worker.checks++;
          const lines = normalizeReplResponse(response);
          if (worker.checks >= this.options.recycleAfter) void worker.start();
          if (lines) return { lines, timedOut: false, outputTruncated: false, exitCode: 0, ms: Math.round(performance.now() - started) };
          void worker.start();
        } catch (error) {
          const timedOut = error instanceof Error && error.message === "repl timeout";
          void worker.start();
          if (timedOut) return { lines: [], timedOut: true, outputTruncated: false, exitCode: null, ms: Math.round(performance.now() - started) };
        }
      }
      return { lines: [], timedOut: false, outputTruncated: false, exitCode: null, ms: Math.round(performance.now() - started) };
    } finally {
      this.release(worker);
    }
  }
}
