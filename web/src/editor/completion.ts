import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { COLOR_NAMES } from "@pp/engine";

export type EditorVariant = "proof" | "helpers";

const TACTICS: Completion[] = [
  { label: "swap", type: "keyword", detail: "(r, c) (r, c)", info: "Exchange two blocks", apply: "swap (" },
  { label: "paint", type: "keyword", detail: "(r, c) color", info: "Recolor one block", apply: "paint (" },
  { label: "rotate", type: "keyword", detail: "(r, c)", info: "Turn an arrow 90 degrees clockwise", apply: "rotate (" },
  { label: "run", type: "keyword", detail: "helper args", info: "Apply a helper's list of moves" },
];

const COLORS: Completion[] = COLOR_NAMES.map((name) => ({ label: name, type: "constant" }));

const HELPER_TERMS: Completion[] = [
  { label: "def", type: "keyword", detail: "name (n : Nat) : List Move := ...", apply: "def " },
  { label: ".swap", type: "function", detail: "(r, c) (r, c)" },
  { label: ".paint", type: "function", detail: "(r, c) color" },
  { label: ".rotate", type: "function", detail: "(r, c)" },
  { label: "List.replicate", type: "function", detail: "n x", info: "n copies of x" },
  { label: "List.map", type: "function", detail: "f xs" },
  { label: "List.range", type: "function", detail: "n", info: "[0, 1, ..., n-1]" },
  { label: "List.flatten", type: "function", detail: "xss", info: "Join a list of lists" },
  { label: "fun", type: "keyword", detail: "x => ...", apply: "fun " },
  ...COLORS,
];

const WORD = /[\w.]*/;

const helperCompletions = (names: readonly string[]): Completion[] =>
  names.map((label) => ({ label, type: "function", detail: "helper" }));

export const makeCompletionSource =
  (variant: EditorVariant, helperNames: () => readonly string[]) =>
  (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(WORD);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const before = context.state.doc.lineAt(context.pos).text.slice(0, word.from - context.state.doc.lineAt(context.pos).from);

    if (variant === "helpers") {
      return { from: word.from, options: [...HELPER_TERMS, ...helperCompletions(helperNames())], validFor: WORD };
    }
    if (before.trim() === "") return { from: word.from, options: TACTICS, validFor: WORD };
    if (/^\s*paint\s*\([^)]*\)\s*$/.test(before)) return { from: word.from, options: COLORS, validFor: WORD };
    if (/^\s*run\s+$/.test(before)) return { from: word.from, options: helperCompletions(helperNames()), validFor: WORD };
    return null;
  };
