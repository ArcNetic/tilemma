import type { CheckResponse, CodeBoard, Diagnostic, LineState, Status } from "@pp/engine";
import type { Preview } from "./preview.js";

export type ViewStatus = Status | "PENDING";

export type View = {
  source: "preview" | "verified";
  status: ViewStatus;
  states: CodeBoard[];
  lineStates: LineState[];
  diagnostics: Diagnostic[];
  axiomsOk: boolean | null;
  leanMs: number;
  needsLean: boolean;
};

export const viewFromPreview = (preview: Preview): View => ({
  source: "preview",
  status: "PENDING",
  states: preview.states,
  lineStates: preview.lineStates,
  diagnostics: preview.diagnostics,
  axiomsOk: null,
  leanMs: 0,
  needsLean: preview.needsLean,
});

export const viewFromResponse = (response: CheckResponse): View => ({
  source: "verified",
  status: response.status,
  states: response.states,
  lineStates: response.lineStates,
  diagnostics: response.diagnostics,
  axiomsOk: response.axiomsOk,
  leanMs: response.leanMs,
  needsLean: false,
});

export const executedLines = (view: View): number[] => {
  let current = 0;
  const lines: number[] = [];
  for (const entry of view.lineStates) {
    if (entry.stateIndex > current) {
      lines.push(entry.line);
      current = entry.stateIndex;
    }
  }
  return lines;
};

export const disagreements = (preview: Preview, verified: View): number[] => {
  const mismatched: number[] = [];
  const verifiedByLine = new Map(verified.lineStates.map((entry) => [entry.line, entry]));
  for (const entry of preview.lineStates) {
    const other = verifiedByLine.get(entry.line);
    if (!other) continue;
    const mine = JSON.stringify(preview.states[entry.stateIndex]);
    const theirs = JSON.stringify(verified.states[other.stateIndex]);
    if (mine !== theirs) mismatched.push(entry.line);
  }
  return mismatched;
};
