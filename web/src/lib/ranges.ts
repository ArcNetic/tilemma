import type { Diagnostic } from "@pp/engine";

export type DocLines = { lineStart: (line: number) => number | undefined; lineEnd: (line: number) => number | undefined; lines: number };

export type Range = { from: number; to: number };

export const rangeFor = (diag: Pick<Diagnostic, "line" | "colStart" | "colEnd">, doc: DocLines): Range | undefined => {
  if (diag.line < 1 || diag.line > doc.lines) return undefined;
  const start = doc.lineStart(diag.line)!;
  const end = doc.lineEnd(diag.line)!;
  const from = Math.min(end, start + diag.colStart);
  const to = Math.min(end, start + Math.max(diag.colEnd, diag.colStart + 1));
  return to > from ? { from, to } : { from: Math.max(start, end - 1), to: end };
};

export const docLinesOf = (text: string): DocLines => {
  const lines = text === "" ? [""] : text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return {
    lines: lines.length,
    lineStart: (n) => starts[n - 1],
    lineEnd: (n) => (starts[n - 1] === undefined ? undefined : starts[n - 1]! + lines[n - 1]!.length),
  };
};

export const diagnosticsForPane = (diagnostics: readonly Diagnostic[], pane: Diagnostic["pane"]): Diagnostic[] =>
  diagnostics.filter((d) => d.pane === pane);

/**
 * Messages about the checker (rate limit, busy, timeout, no verdict, unreadable report), not about the proof.
 * The server pins them to line 1, so they must not mark the player's first line as a mistake.
 */
const SYSTEM_CODES: ReadonlySet<string> = new Set(["RATE_LIMITED", "BUSY", "TIMEOUT", "NO_VERDICT", "BAD_PAYLOAD"]);

export const isSystemDiagnostic = (diagnostic: Pick<Diagnostic, "code">): boolean => SYSTEM_CODES.has(diagnostic.code);

export const firstFailureLine = (diagnostics: readonly Diagnostic[]): number | undefined => {
  const lines = diagnostics.filter((d) => d.pane === "proof" && d.severity === "error" && d.code !== "INCOMPLETE" && !isSystemDiagnostic(d)).map((d) => d.line);
  return lines.length === 0 ? undefined : Math.min(...lines);
};
