export type TokenKind = "ident" | "num" | "sym" | "comment" | "space" | "bad";

export type Token = { readonly kind: TokenKind; readonly text: string; readonly start: number; readonly end: number };

const RULES: readonly [TokenKind, RegExp][] = [
  ["comment", /--.*$/y],
  ["space", / +/y],
  ["ident", /[A-Za-z_][A-Za-z0-9_']*(?:\.[A-Za-z_][A-Za-z0-9_']*)*/y],
  ["num", /[0-9]+/y],
  ["sym", /:=|=>|\+\+|[()[\],.:+\-*]/y],
];

const matchAt = (line: string, start: number): Token => {
  for (const [kind, rule] of RULES) {
    rule.lastIndex = start;
    const match = rule.exec(line);
    if (match) return { kind, text: match[0], start, end: start + match[0].length };
  }
  return { kind: "bad", text: line[start]!, start, end: start + 1 };
};

export const tokenize = (line: string): Token[] => {
  const tokens: Token[] = [];
  let position = 0;
  while (position < line.length) {
    const token = matchAt(line, position);
    tokens.push(token);
    position = token.end;
  }
  return tokens;
};

export const significant = (tokens: readonly Token[]): Token[] =>
  tokens.filter((t) => t.kind !== "space" && t.kind !== "comment");
