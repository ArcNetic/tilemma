import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntime, type Runtime } from "../src/runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const fakeRepl = join(here, "fixtures", "fake-repl.cjs");

let dir = "";
let runtime: Runtime | undefined;
const saved = { ...process.env };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-warm-"));
  process.env.WARM_RETRY_MS = "200";
});

afterEach(async () => {
  await runtime?.app.close();
  runtime = undefined;
  process.env = { ...saved };
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A runtime whose warm workers are the stand-in REPL: silent for its first `slowStarts` starts, then quick. */
const start = (slowStarts: number, retries: number, startupTimeoutMs = 250) => {
  process.env.WARM_RETRIES = String(retries);
  return createRuntime({
    workers: 1,
    mode: "auto",
    logger: false,
    warmOptions: {
      replBin: process.execPath,
      replArgs: [fakeRepl],
      replEnv: { FAKE_REPL_SLOW_FILE: join(dir, "starts"), FAKE_REPL_SLOW_STARTS: String(slowStarts) },
      startupTimeoutMs,
    },
  });
};

const health = async (rt: Runtime): Promise<{ runner: string; warm: boolean }> => {
  const response = await rt.app.inject({ method: "GET", url: "/api/health" });
  return response.json() as { runner: string; warm: boolean };
};

const until = async (condition: () => boolean, ms = 8000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

describe("a warm runner that is slow to start", () => {
  it("is used straight away when it starts in time", async () => {
    runtime = await start(0, 3);
    expect(runtime.runner.kind).toBe("warm");
    expect(await health(runtime)).toMatchObject({ runner: "warm", warm: true });
  });

  it("falls back to the cold runner at once, says why, and switches to the warm one when a retry works", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    runtime = await start(2, 6); // the first boot attempt and the first retry get no answer; the next one does
    expect(runtime.runner.kind).toBe("cold");
    expect(await health(runtime)).toMatchObject({ runner: "cold" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Warm runner did not start: no answer to the library import"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("retrying in the background"));

    await until(() => runtime!.runner.kind === "warm");
    expect(await health(runtime)).toMatchObject({ runner: "warm", warm: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Warm runner not ready yet"));
    expect(log).toHaveBeenCalledWith("Warm runner is ready; checks now use it.");
  });

  it("keeps the cold runner and says so when every retry fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    runtime = await start(100, 2);
    await until(() => log.mock.calls.some((c) => String(c[0]).startsWith("Giving up")));
    expect(runtime.runner.kind).toBe("cold");
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("The cold runner stays in use.");
  });

  it("stops retrying when the server shuts down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    runtime = await start(100, 50);
    await runtime.app.close();
    const logged = log.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(log.mock.calls.length).toBe(logged);
  });
});
