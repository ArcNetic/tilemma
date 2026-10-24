import type { Diagnostic } from "@pp/engine";
import type { ViewStatus } from "./view.js";

export type Tone = "neutral" | "working" | "success" | "error" | "warning";

export type StatusMessage = { tone: Tone; text: string; detail?: string };

export type StatusInput = {
  status: ViewStatus;
  source: "preview" | "verified";
  diagnostics: readonly Diagnostic[];
  checking: boolean;
  mismatchCount: number;
  hasProof: boolean;
  needsLean: boolean;
  offline: boolean;
};

const where = (d: Diagnostic): string => `${d.pane === "helpers" ? "Helpers, line" : "Line"} ${d.line}: `;

const firstDiagnostic = (diagnostics: readonly Diagnostic[]): Diagnostic | undefined => diagnostics.find((d) => d.severity === "error");

const cellWord = (n: number): string => (n === 1 ? "1 block still differs" : `${n} blocks still differ`);

export const statusMessage = (input: StatusInput): StatusMessage => {
  const diag = firstDiagnostic(input.diagnostics);
  if (input.offline) return { tone: "warning", text: "Offline: cannot reach the checker. Your board preview still works." };

  switch (input.status) {
    case "SOLVED":
      return { tone: "success", text: "Solved! Verified by the Lean kernel." };
    case "INCOMPLETE":
      return { tone: "warning", text: `Not there yet: ${cellWord(input.mismatchCount)} from the target. Keep going.` };
    case "ILLEGAL":
    case "EXTRA_MOVES":
    case "SYNTAX_ERROR":
    case "FORBIDDEN":
      return diag ? { tone: "error", text: `${where(diag)}${diag.message}` } : { tone: "error", text: "That proof was rejected." };
    case "TIMEOUT":
      return { tone: "error", text: "Checking took too long and was stopped. Try a smaller helper." };
    case "BUSY":
      return diag?.code === "RATE_LIMITED"
        ? { tone: "warning", text: diag.message }
        : { tone: "warning", text: "The checker is busy. It will retry when you edit again." };
    case "INTERNAL_ERROR":
      return { tone: "error", text: "Something went wrong inside the checker. Try again." };
    case "PENDING":
      break;
  }

  if (diag) return { tone: "error", text: `${where(diag)}${diag.message}`, detail: input.checking ? "Confirming with Lean..." : undefined };
  if (!input.hasProof) return { tone: "neutral", text: "Write one move per line. Try: swap (0, 0) (0, 1)" };
  if (input.needsLean) return { tone: "working", text: input.checking ? "Checking helpers with Lean..." : "Helpers are checked by Lean." };
  return { tone: "working", text: input.checking ? "Checking with Lean..." : "Preview shown. Lean will verify in a moment." };
};
