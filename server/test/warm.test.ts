import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLeanFile, levelBoards, parseProofLine, serializeBoard, splitLines } from "@pp/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCatalog } from "../src/levels.js";
import { parseLeanOutput, parseMessages, type ParseContext } from "../src/parse.js";
import { ColdRunner, resolveLeanBinary } from "../src/runner.js";
import { WarmRunner, normalizeReplResponse, replBinary } from "../src/warm.js";
import { leanProcessCount, referenceRequest } from "./helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const leanDir = join(root, "lean");
const catalog = createCatalog();

type Fixture = { name: string; levelId: string; helpers: string; proof: string; lines: string[] };

const fixtures: Fixture[] = readdirSync(join(here, "fixtures"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as Fixture);

const contextFor = (f: Fixture): ParseContext => {
  const level = catalog.byId(f.levelId)!;
  const boards = levelBoards(level);
  return {
    start: serializeBoard(boards.start),
    file: buildLeanFile(boards, f.helpers, f.proof, "puzzle"),
    proofText: splitLines(f.proof),
    helperText: splitLines(f.helpers),
    parsedProof: splitLines(f.proof).map(parseProofLine),
    theorem: "puzzle",
  };
};

const makeWarm = (workers = 2, timeoutMs = 6000) =>
  new WarmRunner({
    leanDir,
    leanBin: resolveLeanBinary(leanDir),
    replBin: replBinary(root),
    workers,
    timeoutMs,
    recycleAfter: 200,
    maxOutputBytes: 4_000_000,
  });

describe("normalizeReplResponse", () => {
  it("turns REPL messages into Lean --json lines", () => {
    const lines = normalizeReplResponse({
      messages: [{ severity: "info", data: "PP_BOARD {}", pos: { line: 3, column: 2 }, endPos: { line: 3, column: 9 } }],
      env: 1,
    })!;
    expect(parseMessages(lines)).toEqual([{ severity: "information", data: "PP_BOARD {}", pos: { line: 3, column: 2 }, endPos: { line: 3, column: 9 } }]);
  });

  it("accepts a response without messages and rejects garbage", () => {
    expect(normalizeReplResponse({ env: 2 })).toEqual([]);
    expect(normalizeReplResponse("nope")).toBeUndefined();
    expect(normalizeReplResponse({ messages: [{ severity: "fatal" }] })).toBeUndefined();
  });
});

describe("warm runner equals cold runner", () => {
  let warm: WarmRunner;

  beforeAll(async () => {
    warm = makeWarm();
    expect(await warm.warmUp()).toBe(true);
  });

  afterAll(() => warm.shutdown());

  it.each(fixtures.map((f) => [f.name, f] as const))("parses %s identically", async (_name, fixture) => {
    const level = catalog.byId(fixture.levelId)!;
    const file = buildLeanFile(levelBoards(level), fixture.helpers, fixture.proof, "puzzle");
    const outcome = await warm.run(file.source);
    expect(outcome.timedOut).toBe(false);
    const ctx = contextFor(fixture);
    expect(parseLeanOutput(outcome.lines, ctx)).toEqual(parseLeanOutput(fixture.lines, ctx));
  });

  it("is dramatically faster than a cold start", async () => {
    const level = catalog.byId("L04")!;
    const request = referenceRequest(level);
    const file = buildLeanFile(levelBoards(level), request.helpers, request.proof, "puzzle");
    await warm.run(file.source);
    const started = performance.now();
    for (let i = 0; i < 5; i++) await warm.run(file.source);
    expect((performance.now() - started) / 5).toBeLessThan(400);
  });

  it("serves concurrent requests across workers", async () => {
    const level = catalog.byId("L01")!;
    const request = referenceRequest(level);
    const file = buildLeanFile(levelBoards(level), request.helpers, request.proof, "puzzle");
    const results = await Promise.all(Array.from({ length: 8 }, () => warm.run(file.source)));
    for (const r of results) expect(r.lines.length).toBeGreaterThan(0);
  });
});

describe("warm runner recovery", () => {
  it("times out, kills the worker, and recovers on the next request", async () => {
    const warm = makeWarm(1, 1);
    expect(await warm.warmUp()).toBe(true);
    const level = catalog.byId("L12")!;
    const request = referenceRequest(level);
    const file = buildLeanFile(levelBoards(level), request.helpers, request.proof, "puzzle");
    const slow = await warm.run(file.source);
    expect(slow.timedOut).toBe(true);
    const relaxed = new WarmRunner({
      leanDir,
      leanBin: resolveLeanBinary(leanDir),
      replBin: replBinary(root),
      workers: 1,
      timeoutMs: 6000,
      recycleAfter: 200,
      maxOutputBytes: 4_000_000,
    });
    warm.shutdown();
    expect(await relaxed.warmUp()).toBe(true);
    const ok = await relaxed.run(file.source);
    expect(ok.lines.length).toBeGreaterThan(0);
    relaxed.shutdown();
  });

  it("recycles a worker after the configured number of checks and keeps answering", async () => {
    const warm = new WarmRunner({
      leanDir,
      leanBin: resolveLeanBinary(leanDir),
      replBin: replBinary(root),
      workers: 1,
      timeoutMs: 6000,
      recycleAfter: 3,
      maxOutputBytes: 4_000_000,
    });
    await warm.warmUp();
    const level = catalog.byId("L01")!;
    const request = referenceRequest(level);
    const file = buildLeanFile(levelBoards(level), request.helpers, request.proof, "puzzle");
    for (let i = 0; i < 8; i++) {
      const outcome = await warm.run(file.source);
      expect(parseLeanOutput(outcome.lines, contextFor({ name: "x", levelId: "L01", helpers: "", proof: request.proof, lines: [] })).status).toBe("SOLVED");
    }
    warm.shutdown();
  });

  it("leaves no Lean processes behind after shutdown", async () => {
    const before = leanProcessCount();
    const warm = makeWarm(2);
    await warm.warmUp();
    warm.shutdown();
    await new Promise((r) => setTimeout(r, 800));
    expect(leanProcessCount()).toBe(before);
  });

  it("refuses to start without a REPL binary", () => {
    expect(
      () =>
        new WarmRunner({ leanDir, leanBin: "lean", replBin: join(root, "nope"), workers: 1, timeoutMs: 1000, recycleAfter: 10, maxOutputBytes: 1000 }),
    ).toThrow(/not built/);
  });

  it("the cold runner still reports the same status for the same fixture", async () => {
    const cold = new ColdRunner({ leanDir, leanBin: resolveLeanBinary(leanDir), timeoutMs: 8000, maxOutputBytes: 1_000_000 });
    const f = fixtures.find((x) => x.name === "illegal-locked")!;
    const level = catalog.byId(f.levelId)!;
    const outcome = await cold.run(buildLeanFile(levelBoards(level), f.helpers, f.proof, "puzzle").source);
    expect(parseLeanOutput(outcome.lines, contextFor(f)).status).toBe("ILLEGAL");
  });
});
