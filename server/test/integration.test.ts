import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRuntime, type Runtime } from "../src/runtime.js";
import type { CheckResponse } from "../src/diagnostics.js";
import { leanProcessCount, referenceRequest } from "./helpers.js";

describe.each(["cold", "warm"] as const)("%s runner", (mode) => {
  let runtime: Runtime;

  const check = async (levelId: string, proof: string, helpers = ""): Promise<CheckResponse> => {
    const response = await runtime.app.inject({ method: "POST", url: "/api/check", payload: { levelId, helpers, proof } });
    return response.json() as CheckResponse;
  };

  beforeAll(async () => {
    runtime = await createRuntime({ concurrency: 4, checksPerMinute: 100000, mode, workers: 2 });
  });

  afterAll(async () => {
    await runtime.app.close();
  });

  describe("reference solutions through the API", () => {
    it("solves every level", async () => {
      for (const level of runtime.catalog.all) {
        const body = await check(level.id, referenceRequest(level).proof, level.reference.helpers);
        expect(body.diagnostics, level.id).toEqual([]);
        expect(body.status, level.id).toBe("SOLVED");
        expect(body.axiomsOk, level.id).toBe(true);
        expect(body.states.length, level.id).toBe(level.reference.proof.length + 1);
        expect(body.states[body.states.length - 1], level.id).toEqual(level.target);
        expect(body.states[0], level.id).toEqual(level.start);
      }
    });
  });

  describe("one crafted proof per status", () => {
    it("ILLEGAL: locked cell is reported on its line with its cells", async () => {
      const body = await check("L05", "swap (0, 0) (0, 2)\nswap (0, 0) (0, 1)\nrotate (1, 1)");
      expect(body.status).toBe("ILLEGAL");
      expect(body.diagnostics).toHaveLength(1);
      expect(body.diagnostics[0]).toMatchObject({ pane: "proof", line: 2, code: "LOCKED", cells: [[0, 1]], colStart: 0 });
      expect(body.states).toHaveLength(2);
      expect(body.lineStates.map((l) => l.line)).toEqual([1]);
    });

    it("ILLEGAL: out of bounds", async () => {
      const body = await check("L01", "swap (0, 0) (3, 3)");
      expect(body.status).toBe("ILLEGAL");
      expect(body.diagnostics[0]).toMatchObject({ code: "OUT_OF_BOUNDS", cells: [[3, 3]], line: 1 });
    });

    it("ILLEGAL: rotate on a block without an arrow", async () => {
      const body = await check("L04", "rotate (0, 1)");
      expect(body.diagnostics[0]).toMatchObject({ code: "NOT_ROTATABLE", cells: [[0, 1]] });
    });

    it("ILLEGAL: indented lines keep their editor columns", async () => {
      const body = await check("L05", "    swap (0, 0) (0, 1)");
      expect(body.diagnostics[0]).toMatchObject({ line: 1, colStart: 4, colEnd: 22 });
    });

    it("INCOMPLETE: valid but unfinished", async () => {
      const body = await check("L01", "swap (0, 0) (0, 1)");
      expect(body.status).toBe("INCOMPLETE");
      expect(body.states).toHaveLength(2);
      expect(body.diagnostics[0]).toMatchObject({ code: "INCOMPLETE", line: 1 });
    });

    it("INCOMPLETE: empty proof never calls Lean", async () => {
      const before = leanProcessCount();
      const body = await check("L01", "");
      expect(body.status).toBe("INCOMPLETE");
      expect(body.states).toHaveLength(1);
      expect(body.leanMs).toBe(0);
      expect(leanProcessCount()).toBe(before);
    });

    it("EXTRA_MOVES: a move after the board already matches", async () => {
      const body = await check("L01", "swap (0, 0) (0, 1)\nswap (1, 0) (1, 1)\nswap (0, 0) (0, 1)");
      expect(body.status).toBe("EXTRA_MOVES");
      expect(body.diagnostics[0]).toMatchObject({ code: "EXTRA_MOVES", line: 3 });
      expect(body.states).toHaveLength(3);
    });

    it("SYNTAX_ERROR: caught by the sanitizer", async () => {
      const body = await check("L01", "swap (0, 0) (0 1)");
      expect(body.status).toBe("SYNTAX_ERROR");
      expect(body.diagnostics[0]).toMatchObject({ line: 1, colStart: 15 });
    });

    it("FORBIDDEN: move not unlocked on this level", async () => {
      const body = await check("L01", "paint (0, 0) red");
      expect(body.status).toBe("FORBIDDEN");
      expect(body.diagnostics[0]).toMatchObject({ code: "FORBIDDEN", line: 1 });
    });

    it("blank and comment lines map to the previous state", async () => {
      const body = await check("L01", "-- plan\nswap (0, 0) (0, 1)\n\n-- next\nswap (1, 0) (1, 1)");
      expect(body.status).toBe("SOLVED");
      expect(body.lineStates).toEqual([
        { line: 1, stateIndex: 0 },
        { line: 2, stateIndex: 1 },
        { line: 3, stateIndex: 1 },
        { line: 4, stateIndex: 1 },
        { line: 5, stateIndex: 2 },
      ]);
    });
  });

  describe("helpers", () => {
    const ccw = "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))";

    it("reports the failing sub-move of a helper and keeps partial boards", async () => {
      const helpers = "def bad (r c : Nat) : List Move := [.rotate (r, c), .rotate (r, 1)]";
      const body = await check("L10", "run bad 0 0", helpers);
      expect(body.status).toBe("ILLEGAL");
      expect(body.diagnostics[0]).toMatchObject({ pane: "proof", line: 1, substep: 1, code: "NOT_ROTATABLE" });
      expect(body.diagnostics[0]!.message).toContain("Step 2 of helper bad");
      expect(body.lineStates[0]!.substeps).toHaveLength(1);
    });

    it("expands run lines into substeps", async () => {
      const body = await check("L10", "run ccw 0 0", ccw);
      expect(body.lineStates[0]!.substeps).toHaveLength(3);
    });

    it("undefined helper and wrong arity never reach Lean", async () => {
      expect((await check("L10", "run nope 0 0", ccw)).diagnostics[0]!.code).toBe("UNDEFINED_HELPER");
      expect((await check("L10", "run ccw 0", ccw)).diagnostics[0]!.code).toBe("WRONG_ARITY");
    });

    it("a helper whose list is too long gets a clean diagnostic", async () => {
      const helpers = "def big : List Move := List.flatten (List.map (fun i => List.replicate 99 (.rotate (i, i))) (List.range 99))";
      const body = await check("L08", "run big", helpers);
      expect(["SYNTAX_ERROR", "TIMEOUT"]).toContain(body.status);
      expect(body.diagnostics).toHaveLength(1);
    });

    it("a type error in a helper maps back to the helpers pane", async () => {
      const helpers = "def broken : List Move := [.rotate 5]";
      const body = await check("L08", "run broken", helpers);
      expect(body.status).toBe("SYNTAX_ERROR");
      expect(body.diagnostics[0]).toMatchObject({ pane: "helpers", line: 1 });
    });

    it("recursion is a clean diagnostic", async () => {
      const body = await check("L08", "run loop", "def loop : List Move := loop");
      expect(body.diagnostics[0]).toMatchObject({ pane: "helpers", code: "UNKNOWN_NAME" });
    });
  });

  describe("caching", () => {
    it("serves a repeated request from the cache", async () => {
      const proof = "swap (0, 0) (0, 1)\nswap (1, 0) (1, 1)";
      await check("L01", proof);
      const again = await check("L01", proof);
      expect(again.cached).toBe(true);
      expect(again.status).toBe("SOLVED");
    });
  });

  describe("endpoints", () => {
    it("lists levels and omits the reference", async () => {
      const list = (await runtime.app.inject({ url: "/api/levels" })).json() as { id: string }[];
      expect(list).toHaveLength(12);
      const one = (await runtime.app.inject({ url: "/api/levels/L03" })).json() as Record<string, unknown>;
      expect(one.id).toBe("L03");
      expect(one).not.toHaveProperty("reference");
      expect((await runtime.app.inject({ url: "/api/levels/L99" })).statusCode).toBe(404);
    });

    it("reports health", async () => {
      const health = (await runtime.app.inject({ url: "/api/health" })).json() as { lean: string; runner: string };
      expect(health.lean).toBe("4.35.0");
      expect(health.runner).toBe(mode);
    });

    it("rejects malformed requests and unknown levels", async () => {
      expect((await runtime.app.inject({ method: "POST", url: "/api/check", payload: { nope: 1 } })).statusCode).toBe(400);
      expect((await runtime.app.inject({ method: "POST", url: "/api/check", payload: { levelId: "L99", helpers: "", proof: "" } })).statusCode).toBe(404);
    });

    it("rejects oversized bodies", async () => {
      const response = await runtime.app.inject({
        method: "POST",
        url: "/api/check",
        payload: { levelId: "L01", helpers: "", proof: "x".repeat(40_000) },
      });
      expect(response.statusCode).toBe(413);
    });
  });
});
