import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { LruCache } from "../src/cache.js";
import { createChecker } from "../src/check.js";
import { createCatalog } from "../src/levels.js";
import { Pool } from "../src/pool.js";
import { ColdRunner, resolveLeanBinary, type LeanRunner, type RunOutcome } from "../src/runner.js";
import { createRuntime } from "../src/runtime.js";
import { FORBIDDEN_HELPER_BODIES, FORBIDDEN_PAYLOADS } from "./payloads.js";
import { leanProcessCount, referenceRequest } from "./helpers.js";
import { join } from "node:path";

const catalog = createCatalog();

class SpyRunner implements LeanRunner {
  readonly kind = "cold" as const;
  calls = 0;
  constructor(private readonly delayMs = 0) {}
  isWarm = () => true;
  version = async () => "test";
  async run(): Promise<RunOutcome> {
    this.calls++;
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    return { lines: [], timedOut: false, outputTruncated: false, exitCode: 0, ms: this.delayMs };
  }
}

const makeChecker = (runner: LeanRunner, pool = new Pool(2, 5)) =>
  createChecker({ catalog, runner, pool, cache: new LruCache(10), fingerprint: "test", debugLean: false });

describe("forbidden input never reaches Lean", () => {
  it.each(FORBIDDEN_PAYLOADS)("proof payload %s", async (_name, payload) => {
    const runner = new SpyRunner();
    const outcome = await makeChecker(runner).check({ levelId: "L10", helpers: "", proof: payload });
    expect(runner.calls).toBe(0);
    expect(outcome.kind === "response" && ["FORBIDDEN", "SYNTAX_ERROR"].includes(outcome.response.status)).toBe(true);
  });

  it.each(FORBIDDEN_HELPER_BODIES)("helper payload %j", async (body) => {
    const runner = new SpyRunner();
    const outcome = await makeChecker(runner).check({ levelId: "L10", helpers: body, proof: "run x" });
    expect(runner.calls).toBe(0);
    expect(outcome.kind === "response" && ["FORBIDDEN", "SYNTAX_ERROR"].includes(outcome.response.status)).toBe(true);
  });

  it("payloads hidden after valid lines are caught too", async () => {
    const runner = new SpyRunner();
    for (const [, payload] of FORBIDDEN_PAYLOADS) {
      await makeChecker(runner).check({ levelId: "L10", helpers: "", proof: `rotate (0, 0)\n${payload}` });
    }
    expect(runner.calls).toBe(0);
  });

  it("the HTTP layer rejects the same payloads without running Lean", async () => {
    const runner = new SpyRunner();
    const app = await buildApp({ catalog, checker: makeChecker(runner), runner, checksPerMinute: 100000 });
    for (const [, payload] of FORBIDDEN_PAYLOADS) {
      const response = await app.inject({ method: "POST", url: "/api/check", payload: { levelId: "L10", helpers: "", proof: payload } });
      expect(response.statusCode).toBe(200);
      expect(["FORBIDDEN", "SYNTAX_ERROR"]).toContain((response.json() as { status: string }).status);
    }
    expect(runner.calls).toBe(0);
    await app.close();
  });
});

describe("service protection", () => {
  it("answers BUSY with HTTP 429 when the queue is full", async () => {
    const runner = new SpyRunner(300);
    const checker = makeChecker(runner, new Pool(1, 0));
    const app = await buildApp({ catalog, checker, runner, checksPerMinute: 100000 });
    const level = catalog.byId("L01")!;
    const send = (proof: string) => app.inject({ method: "POST", url: "/api/check", payload: { ...referenceRequest(level), proof } });
    const [first, second] = await Promise.all([send("swap (0, 0) (0, 1)"), send("swap (1, 0) (1, 1)")]);
    const codes = [first.statusCode, second.statusCode].sort();
    expect(codes).toEqual([200, 429]);
    const busy = [first, second].find((r) => r.statusCode === 429)!;
    expect((busy.json() as { status: string }).status).toBe("BUSY");
    await app.close();
  });

  it("applies the per-IP rate limit", async () => {
    const runner = new SpyRunner();
    const app = await buildApp({ catalog, checker: makeChecker(runner), runner, checksPerMinute: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await app.inject({ method: "POST", url: "/api/check", payload: { levelId: "L01", helpers: "", proof: "" } })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    await app.close();
  });
});

describe("timeouts", () => {
  it("a run that exceeds the wall budget returns TIMEOUT and leaves no Lean process behind", async () => {
    const leanDir = join(import.meta.dirname, "..", "..", "lean");
    const runner = new ColdRunner({ leanDir, leanBin: resolveLeanBinary(leanDir), timeoutMs: 300, maxOutputBytes: 1_000_000 });
    const checker = makeChecker(runner);
    const before = leanProcessCount();
    const started = performance.now();
    const outcome = await checker.check(referenceRequest(catalog.byId("L01")!));
    const elapsed = performance.now() - started;
    expect(outcome.kind === "response" && outcome.response.status).toBe("TIMEOUT");
    expect(elapsed).toBeLessThan(3000);
    await new Promise((r) => setTimeout(r, 500));
    expect(leanProcessCount()).toBe(before);
  });

  it("a timed-out result is never cached", async () => {
    const leanDir = join(import.meta.dirname, "..", "..", "lean");
    const runner = new ColdRunner({ leanDir, leanBin: resolveLeanBinary(leanDir), timeoutMs: 300, maxOutputBytes: 1_000_000 });
    const checker = makeChecker(runner);
    const request = referenceRequest(catalog.byId("L01")!);
    await checker.check(request);
    const second = await checker.check(request);
    expect(second.kind === "response" && second.response.cached).toBe(false);
  });

  it("no Lean processes remain after a burst of concurrent checks", async () => {
    const runtime = await createRuntime({ concurrency: 4, checksPerMinute: 100000 });
    const level = runtime.catalog.byId("L04")!;
    const before = leanProcessCount();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        runtime.app.inject({
          method: "POST",
          url: "/api/check",
          payload: { ...referenceRequest(level), proof: `${level.reference.proof.join("\n")}\n-- ${i}` },
        }),
      ),
    );
    await runtime.app.close();
    await new Promise((r) => setTimeout(r, 500));
    expect(leanProcessCount()).toBe(before);
  });
});
