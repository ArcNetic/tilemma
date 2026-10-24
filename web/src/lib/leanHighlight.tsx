import type { ReactNode } from "react";

/** A small highlighter for the generated Lean file. It only has to colour what the server writes, so it is a plain token scan. */

const KEYWORDS = new Set([
  "import", "open", "namespace", "section", "end", "theorem", "lemma", "def", "example", "by", "fun", "where", "let", "in", "set_option",
  "#print", "#eval", "#check", "axioms",
]);
const TACTICS = new Set(["swap", "paint", "rotate", "run", "exact", "rfl", "intro", "simp", "decide"]);
const CONSTANTS = new Set(["true", "false", "some", "none", "sorry"]);

const TOKEN = /(--.*$)|("(?:[^"\\]|\\.)*")|(\b\d+\b)|(#?[A-Za-z_][\w.'#]*)|(\s+|.)/g;

type Kind = "comment" | "string" | "number" | "keyword" | "tactic" | "constant" | "type" | "plain";

const classify = (word: string): Kind => {
  if (KEYWORDS.has(word)) return "keyword";
  if (TACTICS.has(word)) return "tactic";
  if (CONSTANTS.has(word)) return word === "sorry" ? "keyword" : "constant";
  if (/^[A-Z]/.test(word) || /^\.[a-z]/.test(word)) return "type";
  return "plain";
};

export const highlightLine = (line: string, key: number): ReactNode => {
  const parts: ReactNode[] = [];
  let index = 0;
  for (const match of line.matchAll(TOKEN)) {
    const [text, comment, string, number, word] = match;
    const kind: Kind = comment ? "comment" : string ? "string" : number ? "number" : word ? classify(word) : "plain";
    parts.push(kind === "plain" ? text : <span key={index} className={`tok tok-${kind}`}>{text}</span>);
    index += 1;
  }
  return <span key={key} className="lean-line">{parts}</span>;
};

/** Returns one element per line so the panel can number them with CSS. */
export const highlightLean = (source: string): ReactNode[] => source.replace(/\n$/, "").split("\n").map((line, i) => highlightLine(line, i));
