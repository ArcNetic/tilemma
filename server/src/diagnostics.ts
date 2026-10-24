export {
  CheckRequestSchema,
  CheckResponseSchema,
  DiagnosticSchema,
  LineStateSchema,
  PANES,
  STATUSES,
  type CheckRequest,
  type CheckResponse,
  type Diagnostic,
  type LineState,
  type Status,
} from "@pp/engine";
import type { Diagnostic } from "@pp/engine";

export const diagnostic = (
  pane: Diagnostic["pane"],
  line: number,
  colStart: number,
  colEnd: number,
  code: string,
  message: string,
  extra: Partial<Pick<Diagnostic, "cells" | "substep" | "severity">> = {},
): Diagnostic => ({ pane, line, colStart, colEnd, severity: "error", code, message, ...extra });
