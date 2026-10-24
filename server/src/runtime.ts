import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { LruCache } from "./cache.js";
import { createChecker } from "./check.js";
import { libraryFingerprint } from "./fingerprint.js";
import { createCatalog } from "./levels.js";
import { Pool } from "./pool.js";
import { ColdRunner, resolveLeanBinary, type LeanRunner } from "./runner.js";
import { SwitchableRunner, WarmPromoter } from "./switch.js";
import { WarmRunner, replBinary, type WarmRunnerOptions } from "./warm.js";

const here = dirname(fileURLToPath(import.meta.url));

const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export type RuntimeOptions = {
  runner?: LeanRunner;
  leanDir?: string;
  webDist?: string;
  concurrency?: number;
  queueLimit?: number;
  timeoutMs?: number;
  checksPerMinute?: number;
  debugLean?: boolean;
  logger?: boolean;
  mode?: "auto" | "warm" | "cold";
  workers?: number;
  /** Overrides for the warm runner. Tests use this to run a stand-in REPL. */
  warmOptions?: Partial<WarmRunnerOptions>;
};

export const createRuntime = async (options: RuntimeOptions = {}) => {
  const leanDir = resolve(options.leanDir ?? process.env.LEAN_DIR ?? join(here, "..", "..", "lean"));
  const catalog = createCatalog();
  const leanBin = resolveLeanBinary(leanDir);
  const mode = options.mode ?? (process.env.RUNNER as RuntimeOptions["mode"]) ?? "auto";
  const workers = options.workers ?? numberFromEnv("WARM_WORKERS", Math.max(1, Math.min(4, availableParallelism() - 1)));
  const makeCold = () =>
    new ColdRunner({
      leanDir,
      leanBin,
      timeoutMs: options.timeoutMs ?? numberFromEnv("LEAN_TIMEOUT_MS", 8000),
      maxOutputBytes: 1_000_000,
      memoryLimitMb: process.env.LEAN_MEMORY_MB ? Number(process.env.LEAN_MEMORY_MB) : undefined,
    });
  let warmRunner: WarmRunner | undefined;
  let lateWarm: WarmRunner | undefined;
  if (!options.runner && mode !== "cold") {
    try {
      const candidate = new WarmRunner({
        leanDir,
        leanBin,
        replBin: replBinary(resolve(leanDir, "..")),
        workers,
        timeoutMs: options.timeoutMs ?? numberFromEnv("WARM_TIMEOUT_MS", 4000),
        recycleAfter: numberFromEnv("WARM_RECYCLE", 200),
        maxOutputBytes: 4_000_000,
        // The first load of the Lean library can take a minute when the operating system has not cached its files yet.
        startupTimeoutMs: numberFromEnv("WARM_STARTUP_MS", 120_000),
        ...options.warmOptions,
      });
      if (await candidate.warmUp()) {
        warmRunner = candidate;
      } else {
        console.warn(`Warm runner did not start: ${candidate.lastFailure() ?? "unknown reason"}. Using the cold runner and retrying in the background.`);
        lateWarm = candidate;
      }
    } catch (error) {
      if (mode === "warm") throw error;
      console.warn(`Warm runner unavailable (${(error as Error).message}); using the cold runner`);
    }
  }
  const coldRunner = options.runner || warmRunner ? undefined : makeCold();
  let runner: LeanRunner = options.runner ?? warmRunner ?? coldRunner!;
  if (coldRunner && lateWarm) {
    const switcher = new SwitchableRunner(coldRunner);
    const promoter = new WarmPromoter(lateWarm, switcher, {
      intervalMs: numberFromEnv("WARM_RETRY_MS", 30_000),
      maxAttempts: numberFromEnv("WARM_RETRIES", 10),
      log: (message) => console.log(message),
    });
    switcher.onShutdown(() => promoter.stop());
    promoter.start();
    runner = switcher;
  }
  const poolSize = warmRunner ? workers : numberFromEnv("CHECK_CONCURRENCY", Math.max(1, availableParallelism() - 1));
  const pool = new Pool(options.concurrency ?? poolSize, options.queueLimit ?? numberFromEnv("CHECK_QUEUE", 20));
  const checker = createChecker({
    catalog,
    runner,
    pool,
    cache: new LruCache(numberFromEnv("CACHE_ENTRIES", 500)),
    fingerprint: libraryFingerprint(leanDir, await runner.version()),
    debugLean: options.debugLean ?? process.env.DEBUG_LEAN !== "0",
  });
  const app = await buildApp({
    catalog,
    checker,
    runner,
    webDist: options.webDist ?? process.env.WEB_DIST ?? join(here, "..", "..", "web", "dist"),
    checksPerMinute: options.checksPerMinute ?? numberFromEnv("CHECKS_PER_MINUTE", 600),
    logger: options.logger,
  });
  return { app, catalog, checker, runner, pool };
};

export type Runtime = Awaited<ReturnType<typeof createRuntime>>;

export const prewarm = async (runtime: Runtime): Promise<number> => {
  const level = runtime.catalog.all[0]!;
  const outcome = await runtime.checker.check({
    levelId: level.id,
    helpers: level.reference.helpers,
    proof: level.reference.proof.join("\n"),
  });
  return outcome.kind === "response" ? outcome.response.leanMs : 0;
};
