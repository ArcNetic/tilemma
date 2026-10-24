import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveLeanBinary, type LeanRunner, type RunOutcome } from "../src/runner.js";
import { SwitchableRunner, WarmPromoter, type WarmCandidate } from "../src/switch.js";
import { WarmRunner, describeExit, durationText, leanBinDir } from "../src/warm.js";

const here = dirname(fileURLToPath(import.meta.url));
const leanDir = join(resolve(here, "..", ".."), "lean");
const fakeRepl = join(here, "fixtures", "fake-repl.cjs");

const live: WarmRunner[] = [];
afterEach(() => {
  for (const runner of live.splice(0)) runner.shutdown();
  vi.useRealTimers();
});

/** A WarmRunner that talks to the stand-in REPL, which can be slow, silent or crashing. */
const fakeWarm = (env: Record<string, string>, startupTimeoutMs: number): WarmRunner => {
  const runner = new WarmRunner({
    leanDir,
    leanBin: process.execPath,
    replBin: process.execPath,
    replArgs: [fakeRepl],
    replEnv: env,
    workers: 1,
    timeoutMs: 2000,
    recycleAfter: 200,
    maxOutputBytes: 1_000_000,
    startupTimeoutMs,
  });
  live.push(runner);
  return runner;
};

describe("starting the warm runner", () => {
  it("starts and answers when the REPL is quick", async () => {
    const runner = fakeWarm({ FAKE_REPL_MODE: "ok" }, 5000);
    expect(await runner.warmUp()).toBe(true);
    expect(runner.lastFailure()).toBeUndefined();
    const outcome = await runner.run("theorem t : True := trivial");
    expect(outcome.timedOut).toBe(false);
    expect(outcome.lines).toEqual([]);
  });

  it("waits for a slow first load as long as the startup limit allows", async () => {
    const runner = fakeWarm({ FAKE_REPL_MODE: "ok", FAKE_REPL_DELAY_MS: "700" }, 5000);
    const started = performance.now();
    expect(await runner.warmUp()).toBe(true);
    expect(performance.now() - started).toBeGreaterThanOrEqual(600);
  });

  it("fails when the first load is slower than the limit, and says that is why and what raises the limit", async () => {
    const runner = fakeWarm({ FAKE_REPL_MODE: "ok", FAKE_REPL_DELAY_MS: "3000" }, 400);
    expect(await runner.warmUp()).toBe(false);
    expect(runner.lastFailure()).toContain("no answer to the library import within 400 ms");
    expect(runner.lastFailure()).toContain("WARM_STARTUP_MS");
  });

  it("reports a REPL that never answers the same way", async () => {
    const runner = fakeWarm({ FAKE_REPL_MODE: "silent" }, 400);
    expect(await runner.warmUp()).toBe(false);
    expect(runner.lastFailure()).toContain("no answer to the library import");
  });

  it("reports the exit code and what the REPL wrote when it crashes at start", async () => {
    const runner = fakeWarm({ FAKE_REPL_MODE: "crash", FAKE_REPL_EXIT: "7", FAKE_REPL_STDERR: "kaboom: library missing" }, 5000);
    expect(await runner.warmUp()).toBe(false);
    expect(runner.lastFailure()).toContain("exited with code 7");
    expect(runner.lastFailure()).toContain("kaboom: library missing");
  });

  it("explains a Windows missing-DLL exit in terms of PATH", async () => {
    const runner = fakeWarm({ FAKE_REPL_MODE: "crash", FAKE_REPL_EXIT: "3221225781" }, 5000);
    expect(await runner.warmUp()).toBe(false);
    expect(runner.lastFailure()).toContain("shared library");
    expect(runner.lastFailure()).toContain("PATH");
  });

  it("can start again after a failure", async () => {
    const runner = fakeWarm({ FAKE_REPL_MODE: "ok", FAKE_REPL_DELAY_MS: "700" }, 300);
    expect(await runner.warmUp()).toBe(false);
    expect(runner.lastFailure()).toBeDefined();
    const retry = fakeWarm({ FAKE_REPL_MODE: "ok", FAKE_REPL_DELAY_MS: "100" }, 3000);
    expect(await retry.warmUp()).toBe(true);
  });
});

describe("durationText", () => {
  it("shows short limits in milliseconds and long ones in seconds", () => {
    expect(durationText(100)).toBe("100 ms");
    expect(durationText(9999)).toBe("9999 ms");
    expect(durationText(10_000)).toBe("10 s");
    expect(durationText(120_000)).toBe("120 s");
  });
});

describe("describeExit", () => {
  it("names the DLL problem, whether it shows as the Windows code or in the message", () => {
    expect(describeExit(3221225781, null, "")).toContain("bin directory must be on PATH");
    expect(describeExit(127, null, "error while loading shared libraries: libleanshared.dll")).toContain("bin directory must be on PATH");
  });

  it("includes the exit code, the last of stderr, and signals", () => {
    expect(describeExit(2, null, "  bad things  ")).toBe("the REPL exited with code 2: bad things");
    expect(describeExit(null, "SIGKILL", "")).toBe("the REPL was stopped by SIGKILL");
    expect(describeExit(1, null, "x".repeat(1000)).length).toBeLessThan(400);
  });
});

describe("leanBinDir", () => {
  it("finds the toolchain's bin directory, the one with the Lean executables and DLLs", () => {
    const bin = leanBinDir(resolveLeanBinary(leanDir), leanDir);
    expect(bin.endsWith("bin")).toBe(true);
    expect(existsSync(join(bin, process.platform === "win32" ? "lean.exe" : "lean"))).toBe(true);
  });

  it("falls back to the directory of the binary when it cannot be asked", () => {
    expect(leanBinDir(process.execPath, leanDir)).toBe(dirname(process.execPath));
  });
});

const stub = (kind: "cold" | "warm", ms: number): LeanRunner & { shutdowns: number } => {
  const runner = {
    kind,
    shutdowns: 0,
    run: async (): Promise<RunOutcome> => ({ lines: [], timedOut: false, outputTruncated: false, exitCode: 0, ms }),
    version: async () => "4.35.0",
    isWarm: () => kind === "warm",
    shutdown() {
      runner.shutdowns += 1;
    },
  };
  return runner;
};

const candidate = (results: boolean[], reason = "slow"): WarmCandidate & { calls: number; shutdowns: number } => {
  const base = stub("warm", 5);
  const c = {
    ...base,
    calls: 0,
    warmUp: async () => results[Math.min(c.calls++, results.length - 1)]!,
    lastFailure: () => reason,
    shutdown: () => {
      c.shutdowns += 1;
    },
  };
  return c;
};

describe("SwitchableRunner", () => {
  it("serves from the fallback until it is promoted, then from the new runner", async () => {
    const cold = stub("cold", 1500);
    const warm = stub("warm", 80);
    const runner = new SwitchableRunner(cold);
    expect(runner.kind).toBe("cold");
    expect(runner.isWarm()).toBe(false);
    expect((await runner.run("x")).ms).toBe(1500);
    runner.promote(warm);
    expect(runner.kind).toBe("warm");
    expect(runner.isWarm()).toBe(true);
    expect((await runner.run("x")).ms).toBe(80);
  });

  it("shuts down both runners and runs registered cleanups", () => {
    const cold = stub("cold", 1);
    const warm = stub("warm", 1);
    const cleanup = vi.fn();
    const runner = new SwitchableRunner(cold);
    runner.onShutdown(cleanup);
    runner.promote(warm);
    runner.shutdown();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cold.shutdowns).toBe(1);
    expect(warm.shutdowns).toBe(1);
  });

  it("does not shut the fallback down twice when nothing was promoted", () => {
    const cold = stub("cold", 1);
    new SwitchableRunner(cold).shutdown();
    expect(cold.shutdowns).toBe(1);
  });
});

describe("WarmPromoter", () => {
  const options = (log: (m: string) => void, maxAttempts = 3) => ({ intervalMs: 1000, maxAttempts, log });

  it("keeps trying and switches over as soon as the warm runner starts", async () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    const cold = stub("cold", 1500);
    const warm = candidate([false, false, true]);
    const switcher = new SwitchableRunner(cold);
    const promoter = new WarmPromoter(warm, switcher, options((m) => logs.push(m), 5));
    promoter.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(switcher.kind).toBe("cold");
    await vi.advanceTimersByTimeAsync(1000);
    expect(switcher.kind).toBe("cold");
    await vi.advanceTimersByTimeAsync(1000);
    expect(switcher.kind).toBe("warm");
    expect(warm.calls).toBe(3);
    expect(logs.filter((m) => m.startsWith("Warm runner not ready yet"))).toHaveLength(2);
    expect(logs.at(-1)).toContain("Warm runner is ready");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(warm.calls).toBe(3);
  });

  it("gives up after the last try, says why, and keeps the cold runner", async () => {
    vi.useFakeTimers();
    const logs: string[] = [];
    const warm = candidate([false], "the REPL exited with code 3");
    const switcher = new SwitchableRunner(stub("cold", 1500));
    new WarmPromoter(warm, switcher, options((m) => logs.push(m), 2)).start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(switcher.kind).toBe("cold");
    expect(warm.calls).toBe(2);
    expect(warm.shutdowns).toBe(1);
    expect(logs.at(-1)).toContain("Giving up");
    expect(logs.at(-1)).toContain("the REPL exited with code 3");
  });

  it("stops retrying and cleans up when the server shuts down", async () => {
    vi.useFakeTimers();
    const warm = candidate([false]);
    const switcher = new SwitchableRunner(stub("cold", 1));
    const promoter = new WarmPromoter(warm, switcher, options(() => undefined, 10));
    switcher.onShutdown(() => promoter.stop());
    promoter.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(warm.calls).toBe(1);
    switcher.shutdown();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(warm.calls).toBe(1);
    expect(warm.shutdowns).toBe(1);
  });

  it("does not shut down a warm runner it has already handed over", async () => {
    vi.useFakeTimers();
    const warm = candidate([true]);
    const switcher = new SwitchableRunner(stub("cold", 1));
    const promoter = new WarmPromoter(warm, switcher, options(() => undefined));
    promoter.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(switcher.kind).toBe("warm");
    promoter.stop();
    expect(warm.shutdowns).toBe(0);
  });
});
