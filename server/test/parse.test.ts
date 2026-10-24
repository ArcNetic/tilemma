import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLeanFile, levelBoards, parseProofLine, serializeBoard, splitLines } from "@pp/engine";
import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/levels.js";
import { parseLeanOutput, parseMessages, type ParseContext } from "../src/parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = createCatalog();

type Fixture = { name: string; levelId: string; helpers: string; proof: string; lines: string[] };

const loadFixture = (name: string): Fixture => JSON.parse(readFileSync(join(here, "fixtures", `${name}.json`), "utf8")) as Fixture;

const contextFor = (levelId: string, helpers: string, proof: string): ParseContext => {
  const level = catalog.byId(levelId)!;
  const boards = levelBoards(level);
  return {
    start: serializeBoard(boards.start),
    file: buildLeanFile(boards, helpers, proof, "puzzle"),
    proofText: splitLines(proof),
    helperText: splitLines(helpers),
    parsedProof: splitLines(proof).map(parseProofLine),
    theorem: "puzzle",
  };
};

const parseFixture = (name: string) => {
  const f = loadFixture(name);
  return { fixture: f, result: parseLeanOutput(f.lines, contextFor(f.levelId, f.helpers, f.proof)) };
};

const info = (line: number, column: number, data: string, endColumn = column + 5) =>
  JSON.stringify({ severity: "information", kind: "[anonymous]", data, pos: { line, column }, endPos: { line, column: endColumn } });

const error = (line: number, column: number, data: string, endColumn = column + 5, kind = "[anonymous]") =>
  JSON.stringify({ severity: "error", kind, data, pos: { line, column }, endPos: { line, column: endColumn } });

const board = (code: string) => `PP_BOARD {"board":[["${code}"]],"substeps":[]}`;

describe("recorded Lean output", () => {
  it("SOLVED", () => {
    const { fixture, result } = parseFixture("solved");
    expect(result.status).toBe("SOLVED");
    expect(result.axiomsOk).toBe(true);
    expect(result.states).toHaveLength(3);
    expect(result.lineStates).toEqual([
      { line: 1, stateIndex: 1 },
      { line: 2, stateIndex: 2 },
    ]);
    expect(result.states[2]).toEqual(catalog.byId(fixture.levelId)!.target);
  });

  it("ILLEGAL", () => {
    const { result } = parseFixture("illegal-locked");
    expect(result.status).toBe("ILLEGAL");
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ pane: "proof", line: 2, code: "LOCKED", cells: [[0, 1]], severity: "error" }),
    ]);
    expect(result.states).toHaveLength(2);
  });

  it("INCOMPLETE", () => {
    const { result } = parseFixture("incomplete");
    expect(result.status).toBe("INCOMPLETE");
    expect(result.diagnostics[0]).toMatchObject({ code: "INCOMPLETE", line: 1 });
    expect(result.axiomsOk).toBeNull();
  });

  it("EXTRA_MOVES", () => {
    const { result } = parseFixture("extra-moves");
    expect(result.status).toBe("EXTRA_MOVES");
    expect(result.diagnostics[0]).toMatchObject({ code: "EXTRA_MOVES", line: 3 });
    expect(result.states).toHaveLength(3);
  });

  it("helper SOLVED keeps substeps per run line", () => {
    const { result } = parseFixture("helper-solved");
    expect(result.status).toBe("SOLVED");
    expect(result.lineStates.map((l) => l.substeps?.length)).toEqual([3, 3, 3]);
  });

  it("helper ILLEGAL reports the sub-move index and partial boards", () => {
    const { result } = parseFixture("helper-illegal-substep");
    expect(result.status).toBe("ILLEGAL");
    expect(result.diagnostics[0]).toMatchObject({ code: "NOT_ROTATABLE", substep: 1, line: 1 });
    expect(result.diagnostics[0]!.message).toContain("Step 2 of helper bad");
    expect(result.lineStates).toEqual([{ line: 1, stateIndex: 0, substeps: [expect.any(Array)] }]);
  });

  it("Lean type errors in helpers map to the helpers pane", () => {
    const { result } = parseFixture("helper-type-error");
    expect(result.status).toBe("SYNTAX_ERROR");
    expect(result.diagnostics[0]).toMatchObject({ pane: "helpers", line: 1, code: "LEAN_ERROR" });
    expect(result.diagnostics[0]!.message.length).toBeLessThanOrEqual(403);
  });

  it("too-long helpers give a clean message without the PP_ prefix", () => {
    const { result } = parseFixture("helper-too-long");
    expect(result.status).toBe("SYNTAX_ERROR");
    expect(result.diagnostics[0]!.message).toBe("list exceeds the allowed length");
  });

  it("comments and blank lines map to the previous state", () => {
    const { result } = parseFixture("comments-and-blanks");
    expect(result.status).toBe("SOLVED");
    expect(result.lineStates).toEqual([
      { line: 1, stateIndex: 0 },
      { line: 2, stateIndex: 1 },
      { line: 3, stateIndex: 1 },
      { line: 4, stateIndex: 1 },
      { line: 5, stateIndex: 2 },
    ]);
  });
});

describe("line mapping", () => {
  const helpers = "def a : List Move := []\ndef b : List Move := []";
  const proof = "  swap (0, 0) (0, 1)\n\n-- note\nrotate (0, 0)";

  it("maps proof lines when helpers are absent", () => {
    const ctx = contextFor("L01", "", "swap (0, 0) (0, 1)\nswap (1, 0) (1, 1)");
    const at = (n: number) => ctx.file.proofStartLine + n;
    const result = parseLeanOutput([info(at(0), 2, board("A")), error(at(1), 2, "PP_EXTRA_MOVES x", 20)], ctx);
    expect(result.status).toBe("EXTRA_MOVES");
    expect(result.diagnostics[0]).toMatchObject({ pane: "proof", line: 2, colStart: 0, colEnd: 18 });
    expect(result.lineStates[0]).toEqual({ line: 1, stateIndex: 1 });
  });

  it("maps proof lines when helpers are present", () => {
    const withHelpers = contextFor("L08", helpers, "run a\nrun b");
    const without = contextFor("L08", "", "run a\nrun b");
    expect(withHelpers.file.proofStartLine - without.file.proofStartLine).toBe(3);
    const msg = error(withHelpers.file.proofStartLine + 1, 2, "something odd", 8);
    expect(parseLeanOutput([msg], withHelpers).diagnostics[0]).toMatchObject({ pane: "proof", line: 2 });
  });

  it("maps helper lines back to the helpers pane", () => {
    const ctx = contextFor("L08", helpers, "run a");
    const msg = error(ctx.file.helpersStartLine + 1, 4, "unknown identifier", 9);
    expect(parseLeanOutput([msg], ctx).diagnostics[0]).toMatchObject({ pane: "helpers", line: 2, colStart: 4, colEnd: 9 });
  });

  it("restores the original indentation in columns", () => {
    const ctx = contextFor("L01", "", "      swap (0, 0) (0, 1)");
    const msg = error(ctx.file.proofStartLine, 2, `PP_ILLEGAL {"reason":"LOCKED","cells":[[0,0]],"substep":null,"substeps":[]}`, 20);
    expect(parseLeanOutput([msg], ctx).diagnostics[0]).toMatchObject({ line: 1, colStart: 6, colEnd: 24 });
  });

  it("keeps blank and comment lines in the line table until the first unexecuted move", () => {
    const ctx = contextFor("L01", "", proof);
    const result = parseLeanOutput([info(ctx.file.proofStartLine, 2, board("A"))], ctx);
    expect(result.lineStates.map((l) => [l.line, l.stateIndex])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
  });

  it("falls back to the last move line for errors outside both panes", () => {
    const ctx = contextFor("L01", "", "swap (0, 0) (0, 1)\n\n-- trailing");
    const result = parseLeanOutput([error(1, 0, "odd failure")], ctx);
    expect(result.diagnostics[0]).toMatchObject({ pane: "proof", line: 1 });
  });

  it("last PP_BOARD on a line wins", () => {
    const ctx = contextFor("L01", "", "swap (0, 0) (0, 1)");
    const line = ctx.file.proofStartLine;
    const result = parseLeanOutput(
      [info(line, 2, board("A")), info(line, 2, board("B")), info(line + 3, 0, "'puzzle' does not depend on any axioms")],
      ctx,
    );
    expect(result.states[1]).toEqual([["B"]]);
    expect(result.status).toBe("SOLVED");
  });
});

describe("defensive parsing", () => {
  const ctx = contextFor("L01", "", "swap (0, 0) (0, 1)");
  const line = ctx.file.proofStartLine;

  it("ignores non-JSON noise and malformed messages", () => {
    expect(parseMessages(["", "garbage", "{}", '{"severity":"info"}', "[1,2]"])).toEqual([]);
  });

  it("joins payloads wrapped across lines", () => {
    const wrapped = 'PP_ILLEGAL {"reason":"LOCKED",\n    "cells":[[0,1]],"substep":null,\n  "substeps":[]}';
    const result = parseLeanOutput([error(line, 2, wrapped, 20)], ctx);
    expect(result.status).toBe("ILLEGAL");
    expect(result.diagnostics[0]).toMatchObject({ code: "LOCKED", cells: [[0, 1]] });
  });

  it("reports INTERNAL_ERROR for an unreadable illegal payload", () => {
    const result = parseLeanOutput([error(line, 2, "PP_ILLEGAL {nope", 20)], ctx);
    expect(result.status).toBe("INTERNAL_ERROR");
  });

  it("no errors and no axioms line is INTERNAL_ERROR, never SOLVED", () => {
    expect(parseLeanOutput([info(line, 2, board("A"))], ctx).status).toBe("INTERNAL_ERROR");
  });

  it("sorryAx makes a clean compile INTERNAL_ERROR", () => {
    const result = parseLeanOutput([info(line, 2, board("A")), info(line + 2, 0, "'puzzle' depends on axioms: [propext, sorryAx]")], ctx);
    expect(result.status).toBe("INTERNAL_ERROR");
    expect(result.axiomsOk).toBe(false);
  });

  it("ofReduceBool is rejected as well", () => {
    const result = parseLeanOutput([info(line + 2, 0, "'puzzle' depends on axioms: [Lean.ofReduceBool]")], ctx);
    expect(result.status).toBe("INTERNAL_ERROR");
  });

  it("standard axioms are accepted", () => {
    const result = parseLeanOutput([info(line + 2, 0, "'puzzle' depends on axioms: [propext, Classical.choice, Quot.sound]")], ctx);
    expect(result.status).toBe("SOLVED");
  });

  it("an axioms line for a different theorem is ignored", () => {
    const result = parseLeanOutput([info(line + 2, 0, "'other' depends on axioms: [propext]")], ctx);
    expect(result.status).toBe("INTERNAL_ERROR");
  });

  it("PP_BAD_GOAL is INTERNAL_ERROR", () => {
    expect(parseLeanOutput([error(line, 2, "PP_BAD_GOAL nope")], ctx).status).toBe("INTERNAL_ERROR");
  });

  it("unsolved goals are recognised by kind or text", () => {
    expect(parseLeanOutput([error(line - 1, 54, "unsolved goals\n⊢ x", 20, "Tactic.unsolvedGoals")], ctx).status).toBe("INCOMPLETE");
    expect(parseLeanOutput([error(line - 1, 54, "unsolved goals\n⊢ x")], ctx).status).toBe("INCOMPLETE");
  });

  it("long messages are truncated and cleaned", () => {
    const long = `type mismatch\n${"x ".repeat(500)}`;
    const result = parseLeanOutput([error(line, 2, long, 8)], ctx);
    expect(result.status).toBe("SYNTAX_ERROR");
    expect(result.diagnostics[0]!.message.length).toBeLessThanOrEqual(403);
    expect(result.diagnostics[0]!.message).not.toContain("\n");
  });
});
