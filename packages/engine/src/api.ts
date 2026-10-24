import { z } from "zod";

export const PANES = ["proof", "helpers"] as const;

export const STATUSES = [
  "SOLVED",
  "INCOMPLETE",
  "ILLEGAL",
  "EXTRA_MOVES",
  "SYNTAX_ERROR",
  "FORBIDDEN",
  "TIMEOUT",
  "BUSY",
  "INTERNAL_ERROR",
] as const;

export type Status = (typeof STATUSES)[number];

export const DiagnosticSchema = z.object({
  pane: z.enum(PANES),
  line: z.number().int().positive(),
  colStart: z.number().int().nonnegative(),
  colEnd: z.number().int().nonnegative(),
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  message: z.string(),
  cells: z.array(z.tuple([z.number().int(), z.number().int()])).optional(),
  substep: z.number().int().nonnegative().optional(),
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export const LineStateSchema = z.object({
  line: z.number().int().positive(),
  stateIndex: z.number().int().nonnegative(),
  substeps: z.array(z.array(z.array(z.string()))).optional(),
});

export type LineState = z.infer<typeof LineStateSchema>;

export const CheckRequestSchema = z.object({
  levelId: z.string().regex(/^L\d{2}$/),
  helpers: z.string().max(20_000),
  proof: z.string().max(20_000),
});

export type CheckRequest = z.infer<typeof CheckRequestSchema>;

export const CheckResponseSchema = z.object({
  status: z.enum(STATUSES),
  states: z.array(z.array(z.array(z.string()))),
  lineStates: z.array(LineStateSchema),
  diagnostics: z.array(DiagnosticSchema),
  axiomsOk: z.boolean().nullable(),
  leanMs: z.number(),
  cached: z.boolean(),
  generatedLean: z.string().optional(),
});

export type CheckResponse = z.infer<typeof CheckResponseSchema>;
