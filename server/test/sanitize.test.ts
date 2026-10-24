import { describe, expect, it } from "vitest";
import { sanitize } from "../src/sanitize.js";
import { createCatalog } from "../src/levels.js";
import { FORBIDDEN_HELPER_BODIES, FORBIDDEN_PAYLOADS } from "./payloads.js";

const catalog = createCatalog();
const level = (id: string) => catalog.byId(id)!;

const FLIP = "def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 3), .swap (r, 1) (r, 2)]";

const codesOf = (helpers: string, proof: string, id: string) => {
  const result = sanitize(helpers, proof, level(id));
  return result.ok ? [] : result.diagnostics.map((d) => d.code);
};

const firstDiagnostic = (helpers: string, proof: string, id: string) => {
  const result = sanitize(helpers, proof, level(id));
  if (result.ok) throw new Error("expected rejection");
  return result.diagnostics[0]!;
};

describe("proof lines", () => {
  it("accepts every reference solution", () => {
    for (const l of catalog.all) {
      const result = sanitize(l.reference.helpers, l.reference.proof.join("\n"), l);
      expect(result.ok, l.id).toBe(true);
    }
  });

  it("accepts blank lines and comments", () => {
    expect(sanitize("", "-- plan\n\nswap (0, 0) (0, 1)  -- go\n", level("L01")).ok).toBe(true);
  });

  it("allows non-ascii text inside comments", () => {
    expect(sanitize("", `-- ${String.fromCodePoint(0x4f60, 0x597d)}\nswap (0, 0) (0, 1)`, level("L01")).ok).toBe(true);
  });

  it("reports syntax errors with columns", () => {
    const d = firstDiagnostic("", "swap (0, 0) (0 1)", "L01");
    expect(d).toMatchObject({ pane: "proof", line: 1, code: "SYNTAX", colStart: 15 });
  });

  it("rejects tabs", () => {
    expect(codesOf("", "swap\t(0, 0) (0, 1)", "L01")).toContain("TAB");
  });

  it("rejects homoglyph letters", () => {
    const cyrillicA = String.fromCodePoint(0x430);
    expect(codesOf("", `sw${cyrillicA}p (0, 0) (0, 1)`, "L01")).toContain("FORBIDDEN_TOKEN");
  });

  it("rejects bidi override characters even in comments", () => {
    expect(codesOf("", `-- ${String.fromCodePoint(0x202e)}\nswap (0, 0) (0, 1)`, "L01")).toContain("BAD_CHARACTER");
  });

  it("rejects overlong lines", () => {
    expect(codesOf("", `swap (0, 0) (0, 1) -- ${"x".repeat(130)}`, "L01")).toContain("LINE_TOO_LONG");
  });

  it("rejects too many lines", () => {
    expect(codesOf("", "swap (0, 0) (0, 1)\n".repeat(201), "L01")).toContain("TOO_LONG");
  });

  it("rejects huge coordinates", () => {
    expect(codesOf("", "swap (0, 0) (0, 100000000000000000000)", "L01")).toContain("SYNTAX");
  });

  it("rejects trailing garbage", () => {
    expect(codesOf("", "swap (0, 0) (0, 1) <;> simp", "L01").length).toBeGreaterThan(0);
  });
});


describe("forbidden payloads in the proof pane", () => {
  it.each(FORBIDDEN_PAYLOADS)("rejects %s", (_name, payload) => {
    expect(codesOf("", payload, "L01").length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN_PAYLOADS)("rejects %s even after valid lines", (_name, payload) => {
    expect(codesOf("", `swap (0, 0) (0, 1)\n${payload}`, "L01").length).toBeGreaterThan(0);
  });
});

describe("forbidden payloads in the helpers pane", () => {

  it.each(FORBIDDEN_HELPER_BODIES)("rejects %j", (body) => {
    expect(codesOf(body, "", "L10").length).toBeGreaterThan(0);
  });
});

describe("helper grammar", () => {
  it("accepts parameterless, parameterized and composed helpers", () => {
    const helpers = [
      "def turn : List Move := [.rotate (0, 0)]",
      "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))",
      "def both (r : Nat) : List Move := ccw r 0 ++ turn",
      "def spin : List Move := List.map (fun i => .rotate (i, i)) (List.range 3)",
    ].join("\n");
    expect(sanitize(helpers, "run both 0", level("L10")).ok).toBe(true);
  });

  it("accepts multi-line definitions", () => {
    const helpers = "def two (r : Nat) : List Move :=\n  [.rotate (r, 0),\n   .rotate (r, 1)]";
    expect(sanitize(helpers, "run two 0", level("L10")).ok).toBe(true);
  });

  it("rejects recursion by name resolution", () => {
    const d = firstDiagnostic("def loop : List Move := loop", "run loop", "L08");
    expect(d.code).toBe("UNKNOWN_NAME");
    expect(d.pane).toBe("helpers");
  });

  it("rejects reserved names", () => {
    expect(codesOf("def swap : List Move := []", "", "L08")).toContain("RESERVED_NAME");
    expect(codesOf("def step : List Move := []", "", "L08")).toContain("RESERVED_NAME");
  });

  it("rejects non-lowercase and long names", () => {
    expect(codesOf("def Flip : List Move := []", "", "L08")).toContain("BAD_NAME");
    expect(codesOf(`def ${"a".repeat(25)} : List Move := []`, "", "L08")).toContain("NAME_TOO_LONG");
  });

  it("rejects duplicate helper names", () => {
    expect(codesOf("def a : List Move := []\ndef a : List Move := []", "", "L08")).toContain("DUPLICATE_NAME");
  });

  it("limits the number of helpers", () => {
    const many = Array.from({ length: 9 }, (_, i) => `def h${i} : List Move := []`).join("\n");
    expect(codesOf(many, "", "L10")).toContain("TOO_MANY_HELPERS");
  });

  it("limits number literals", () => {
    expect(codesOf("def big : List Move := List.replicate 1000000 (.rotate (0, 0))", "", "L08")).toContain("NUMBER_TOO_LARGE");
  });

  it("requires parameters of type Nat", () => {
    expect(codesOf("def a (r : Bool) : List Move := []", "", "L10")).toContain("SYNTAX");
  });

  it("requires the List Move return type", () => {
    expect(codesOf("def a := []", "", "L08")).toContain("SYNTAX");
  });

  it("rejects an indented first line of a definition", () => {
    expect(codesOf("  def a : List Move := []", "", "L08")).toContain("SYNTAX");
  });
});

describe("level restrictions", () => {
  it("rejects moves a level has not unlocked", () => {
    expect(firstDiagnostic("", "paint (0, 0) red", "L01")).toMatchObject({ code: "FORBIDDEN", line: 1 });
    expect(codesOf("", "rotate (0, 0)", "L02")).toEqual(["FORBIDDEN"]);
  });

  it("rejects colors outside the palette", () => {
    expect(codesOf("", "paint (0, 0) black", "L02")).toEqual(["FORBIDDEN"]);
    expect(codesOf("", "paint (0, 0) pink", "L02")).toEqual(["SYNTAX"]);
  });

  it("rejects helpers on non-helper levels", () => {
    expect(codesOf("def a : List Move := []", "swap (0, 0) (0, 1)", "L01")).toEqual(["FORBIDDEN"]);
    expect(codesOf("", "run a", "L01")).toEqual(["FORBIDDEN"]);
  });

  it("rejects parameters on simple-helper levels", () => {
    expect(codesOf("def a (r : Nat) : List Move := []", "", "L08")).toEqual(["FORBIDDEN"]);
  });

  it("rejects undefined helpers and wrong arity", () => {
    expect(codesOf("", "run nope", "L08")).toEqual(["UNDEFINED_HELPER"]);
    const d = firstDiagnostic(FLIP, "run flipRow", "L09");
    expect(d.code).toBe("WRONG_ARITY");
    expect(codesOf(FLIP, "run flipRow 0 1", "L09")).toEqual(["WRONG_ARITY"]);
  });

  it("rejects forbidden moves inside helper bodies", () => {
    expect(codesOf("def a : List Move := [.paint (0, 0) purple]", "", "L10")).toEqual(["FORBIDDEN"]);
  });
});
