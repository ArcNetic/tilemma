import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LevelSchema,
  applyAll,
  parseBoard,
  parseProofLine,
  serializeBoard,
  type ColorCode,
  type Level,
  type Move,
} from "@pp/engine";

type Draft = Omit<Level, "target" | "par" | "reference"> & {
  proof: string[];
  helpersText: string;
  expandedHelpers?: Record<string, (...args: number[]) => Move[]>;
  par: number;
};

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const swap = (a: [number, number], b: [number, number]): Move => ({ kind: "swap", a, b });
const rotate = (a: [number, number]): Move => ({ kind: "rotate", a });

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

const flipRow5 = (r: number): Move[] => [swap([r, 0], [r, 4]), swap([r, 1], [r, 3])];
const flipRow4 = (r: number): Move[] => [swap([r, 0], [r, 3]), swap([r, 1], [r, 2])];
const mirror5 = (): Move[] => range(5).flatMap(flipRow5);
const ccw = (r: number, c: number): Move[] => [rotate([r, c]), rotate([r, c]), rotate([r, c])];
const half = (r: number, c: number): Move[] => [rotate([r, c]), rotate([r, c])];
const diag5 = (): Move[] => range(5).map((i) => rotate([i, i]));

const expandProof = (draft: Draft): Move[] =>
  draft.proof.flatMap((line) => {
    const parsed = parseProofLine(line);
    if (parsed.kind === "move") return [parsed.move];
    if (parsed.kind === "run") {
      const expand = draft.expandedHelpers?.[parsed.name];
      if (!expand) throw new Error(`${draft.id}: no expansion for helper ${parsed.name}`);
      return expand(...parsed.args);
    }
    throw new Error(`${draft.id}: cannot parse reference line ${JSON.stringify(line)}`);
  });

const buildLevel = (draft: Draft): Level => {
  const { proof, helpersText, expandedHelpers: _expanded, ...rest } = draft;
  const result = applyAll(expandProof(draft), parseBoard(draft.start));
  if (!result) throw new Error(`${draft.id}: reference proof is illegal`);
  return LevelSchema.parse({
    ...rest,
    target: serializeBoard(result),
    reference: { helpers: helpersText, proof },
  });
};

const ALL_MOVES = ["swap", "paint", "rotate"] as const;
const BASIC: ColorCode[] = ["R", "G", "B", "Y"];
const WIDE: ColorCode[] = ["R", "G", "B", "Y", "W", "K"];

const drafts: Draft[] = [
  {
    id: "L01",
    order: 1,
    title: "First Swap",
    concept: "swap",
    intro: "Each line is one move. swap (row, col) (row, col) trades two blocks. Rows and columns count from 0 at the top left.",
    hint: "Swap the two blocks in the top row, then the two in the bottom row.",
    start: [["R.", "G."], ["B.", "Y."]],
    moves: ["swap"],
    palette: [],
    helpers: "none",
    par: 2,
    helpersText: "",
    proof: ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"],
  },
  {
    id: "L02",
    order: 2,
    title: "Fresh Paint",
    concept: "paint",
    intro: "paint (row, col) color recolors one block. Colors: red, green, blue, yellow.",
    hint: "Two blocks differ from the target: the top left and the bottom right.",
    start: [["R.", "R."], ["B.", "B."]],
    moves: ["paint"],
    palette: BASIC,
    helpers: "none",
    par: 2,
    helpersText: "",
    proof: ["paint (0, 0) green", "paint (1, 1) yellow"],
  },
  {
    id: "L03",
    order: 3,
    title: "Quarter Turn",
    concept: "rotate",
    intro: "rotate (row, col) turns an arrow 90 degrees clockwise. Blocks without an arrow cannot rotate.",
    hint: "Up becomes right, right becomes down.",
    start: [["R^", "G."], ["B.", "Y>"]],
    moves: ["rotate"],
    palette: [],
    helpers: "none",
    par: 2,
    helpersText: "",
    proof: ["rotate (0, 0)", "rotate (1, 1)"],
  },
  {
    id: "L04",
    order: 4,
    title: "Mixed Bag",
    concept: "mix",
    intro: "All three moves are available now. Compare the boards and decide which move fixes each difference.",
    hint: "One rotation, one paint, one swap.",
    start: [["R^", "G.", "B."], ["Y.", "W.", "R."], ["G.", "B.", "Y."]],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "none",
    par: 3,
    helpersText: "",
    proof: ["rotate (0, 0)", "paint (1, 1) blue", "swap (0, 2) (2, 0)"],
  },
  {
    id: "L05",
    order: 5,
    title: "Under Lock",
    concept: "locks",
    intro: "Locked blocks never move, change color, or rotate. Plan around them.",
    hint: "The locked green block stays put. Paint the bottom right instead of swapping for it.",
    start: [["R^", "G.#", "B."], ["Y.", "R>", "G."], ["B.", "Y.", "W."]],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "none",
    par: 3,
    helpersText: "",
    proof: ["swap (0, 0) (0, 2)", "rotate (1, 1)", "paint (2, 2) green"],
  },
  {
    id: "L06",
    order: 6,
    title: "Mind the Order",
    concept: "planning",
    intro: "A paint sticks to the block, not the square. Moving a painted block carries its color along.",
    hint: "Paint the top left blue before you swap it away.",
    start: [["R.", "G.", "B."], ["Y.", "W.", "R."], ["G.", "B.", "Y."]],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "none",
    par: 4,
    helpersText: "",
    proof: ["paint (0, 0) blue", "swap (0, 0) (2, 2)", "swap (0, 1) (1, 2)", "paint (1, 1) green"],
  },
  {
    id: "L07",
    order: 7,
    title: "Bigger Board",
    concept: "planning",
    intro: "Four by four. Count the differences first, then find the cheapest sequence.",
    hint: "Two rotations and two swaps cover most of it.",
    start: [
      ["R^", "G.", "B.", "Y."],
      ["Y.", "W>", "R.", "G."],
      ["G.", "B.", "Yv", "W."],
      ["W.", "R.#", "G.", "B<"],
    ],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "none",
    par: 6,
    helpersText: "",
    proof: [
      "rotate (0, 0)",
      "rotate (1, 1)",
      "swap (0, 3) (3, 0)",
      "paint (2, 2) red",
      "swap (1, 2) (2, 1)",
      "paint (3, 3) white",
    ],
  },
  {
    id: "L08",
    order: 8,
    title: "Name It",
    concept: "helper intro",
    intro: "A helper is a Lean definition that returns a list of moves. Define it once, then use run to apply it as often as you like.",
    hint: "run turn three times rotates both arrows three quarter turns.",
    start: [
      ["R^", "G.", "B.", "Y."],
      ["Y.", "G>", "R.", "G."],
      ["G.", "B.", "W.", "W."],
      ["W.", "R.", "G.", "B."],
    ],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "simple",
    par: 4,
    starterHelpers: "def turn : List Move := [.rotate (0, 0), .rotate (1, 1)]",
    helpersText: "def turn : List Move := [.rotate (0, 0), .rotate (1, 1)]",
    proof: ["run turn", "run turn", "run turn", "swap (2, 2) (3, 3)"],
    expandedHelpers: { turn: () => [rotate([0, 0]), rotate([1, 1])] },
  },
  {
    id: "L09",
    order: 9,
    title: "Row Flipper",
    concept: "helper reuse",
    intro: "Helpers take Nat parameters. One definition can serve every row.",
    hint: "flipRow r reverses row r. Call it on each row.",
    start: [
      ["R.", "G.", "B.", "Y."],
      ["Y.", "B.", "R.", "G."],
      ["G.", "W.", "B.", "R."],
      ["W.", "R.", "Y.", "B."],
    ],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "params",
    par: 4,
    starterHelpers: "def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 3), .swap (r, 1) (r, 2)]",
    helpersText: "def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 3), .swap (r, 1) (r, 2)]",
    proof: ["run flipRow 0", "run flipRow 1", "run flipRow 2", "run flipRow 3"],
    expandedHelpers: { flipRow: flipRow4 },
  },
  {
    id: "L10",
    order: 10,
    title: "Counter Clockwise",
    concept: "ccw",
    intro: "There is no counter clockwise move, but three clockwise turns make one. List.replicate n x builds a list of n copies of x.",
    hint: "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))",
    start: [["R^", "G.", "B."], ["Y.", "G>", "R."], ["G.", "B.", "Wv"]],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "params",
    par: 3,
    starterHelpers: "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))",
    helpersText: "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))",
    proof: ["run ccw 0 0", "run ccw 1 1", "run ccw 2 2"],
    expandedHelpers: { ccw },
  },
  {
    id: "L11",
    order: 11,
    title: "Compose",
    concept: "composition",
    intro: "Helpers can call other helpers. List.map applies a function to every element and List.flatten joins a list of lists.",
    hint: "mirror flips every row. Run it before turning the corner arrows.",
    start: [
      ["R^", "G.", "B.", "Y.", "W."],
      ["Y.", "B.", "R.", "G.", "K."],
      ["G.", "W.", "R.", "B.", "Y."],
      ["W.", "R.", "Y.", "B.", "G."],
      ["K.", "G.", "B.", "R.", "Yv"],
    ],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "params",
    par: 5,
    starterHelpers: [
      "def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 4), .swap (r, 1) (r, 3)]",
      "def mirror : List Move := List.flatten (List.map flipRow (List.range 5))",
      "def half (r c : Nat) : List Move := List.replicate 2 (.rotate (r, c))",
    ].join("\n"),
    helpersText: [
      "def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 4), .swap (r, 1) (r, 3)]",
      "def mirror : List Move := List.flatten (List.map flipRow (List.range 5))",
      "def half (r c : Nat) : List Move := List.replicate 2 (.rotate (r, c))",
    ].join("\n"),
    proof: ["run mirror", "run half 0 4", "run half 4 0", "paint (2, 2) white", "paint (0, 2) black"],
    expandedHelpers: { mirror: mirror5, half },
  },
  {
    id: "L12",
    order: 12,
    title: "Boss: Full Stack",
    concept: "boss",
    intro: "Everything at once: locks, helpers built from helpers, and a tight line budget.",
    hint: "Spin the diagonal, mirror the board, then fix the leftovers. Mind the lock on the top row.",
    start: [
      ["R^", "G.", "B.#", "Y.", "W>"],
      ["Y.", "B>", "R.", "Gv", "K."],
      ["G.", "W.", "R^", "B.", "Y."],
      ["W.", "R.", "Y.", "B<", "G."],
      ["K.", "G.", "B.", "R.", "Y>"],
    ],
    moves: [...ALL_MOVES],
    palette: WIDE,
    helpers: "params",
    par: 6,
    starterHelpers: [
      "def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 4), .swap (r, 1) (r, 3)]",
      "def mirror : List Move := List.flatten (List.map flipRow (List.range 5))",
      "def diag : List Move := List.map (fun i => .rotate (i, i)) (List.range 5)",
      "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))",
    ].join("\n"),
    helpersText: [
      "def flipRow (r : Nat) : List Move := [.swap (r, 0) (r, 4), .swap (r, 1) (r, 3)]",
      "def mirror : List Move := List.flatten (List.map flipRow (List.range 5))",
      "def diag : List Move := List.map (fun i => .rotate (i, i)) (List.range 5)",
      "def ccw (r c : Nat) : List Move := List.replicate 3 (.rotate (r, c))",
    ].join("\n"),
    proof: ["run diag", "run mirror", "run ccw 0 4", "swap (1, 1) (3, 3)", "paint (2, 2) blue", "paint (4, 0) red"],
    expandedHelpers: { mirror: mirror5, diag: diag5, ccw },
  },
];

const outDir = join(rootDir, "levels");
mkdirSync(outDir, { recursive: true });
for (const draft of drafts) {
  const level = buildLevel(draft);
  writeFileSync(join(outDir, `${level.id}.json`), `${JSON.stringify(level, null, 2)}\n`);
  console.log(`wrote ${level.id} ${level.title}`);
}
