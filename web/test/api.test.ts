import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchLevels, postCheck } from "../src/lib/api.js";
import { statusMessage } from "../src/lib/status.js";

const reply = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const request = { levelId: "L01", helpers: "", proof: "swap (0, 0) (0, 1)" };

const solved = {
  status: "SOLVED",
  states: [[["R."]]],
  lineStates: [],
  diagnostics: [],
  axiomsOk: true,
  leanMs: 3,
  cached: false,
};

afterEach(() => vi.unstubAllGlobals());

describe("postCheck", () => {
  it("returns a validated response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, solved)));
    expect((await postCheck(request)).status).toBe("SOLVED");
  });

  it("passes through a BUSY body sent with HTTP 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(429, { ...solved, status: "BUSY" })));
    expect((await postCheck(request)).status).toBe("BUSY");
  });

  it("turns a rate-limiter 429 into a friendly BUSY result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(429, { statusCode: 429, error: "Too Many Requests", message: "Rate limit exceeded" })));
    const response = await postCheck(request);
    expect(response.status).toBe("BUSY");
    expect(response.diagnostics[0]).toMatchObject({ code: "RATE_LIMITED" });
    expect(statusMessage({ status: "BUSY", source: "verified", diagnostics: response.diagnostics, checking: false, mismatchCount: 0, hasProof: true, needsLean: false, offline: false }).text).toContain("Slow down");
  });

  it("reports an unreachable server as offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed to fetch")));
    await expect(postCheck(request)).rejects.toMatchObject({ offline: true });
  });

  it("rethrows aborts untouched so stale requests are ignored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    await expect(postCheck(request)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects unexpected statuses and malformed 200 bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(500, "boom")));
    await expect(postCheck(request)).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, { nope: true })));
    await expect(postCheck(request)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("fetchLevels", () => {
  it("validates the level list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, [{ id: "L01", order: 1, title: "A", concept: "swap", par: 2, helpers: "none" }])));
    expect(await fetchLevels()).toHaveLength(1);
  });

  it("fails clearly on server errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(503, "")));
    await expect(fetchLevels()).rejects.toMatchObject({ offline: false });
  });
});
