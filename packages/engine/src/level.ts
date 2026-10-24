import { z } from "zod";
import { isCellCode, parseBoard } from "./codes.js";
import { COLOR_CODES, MOVE_KINDS, type Board } from "./types.js";

export const MAX_SIDE = 6;

const codeRow = z.array(z.string().refine(isCellCode, "invalid cell code")).min(1).max(MAX_SIDE);

export const CodeBoardSchema = z
  .array(codeRow)
  .min(1)
  .max(MAX_SIDE)
  .refine((rows) => rows.every((row) => row.length === rows[0]!.length), "board rows must have equal length");

export const HELPER_MODES = ["none", "simple", "params"] as const;

export const LevelSchema = z.object({
  id: z.string().regex(/^L\d{2}$/),
  order: z.number().int().positive(),
  title: z.string().min(1),
  concept: z.string().min(1),
  intro: z.string().min(1),
  hint: z.string().min(1),
  start: CodeBoardSchema,
  target: CodeBoardSchema,
  moves: z.array(z.enum(MOVE_KINDS)).min(1),
  palette: z.array(z.enum(COLOR_CODES)),
  helpers: z.enum(HELPER_MODES),
  par: z.number().int().positive(),
  starterHelpers: z.string().optional(),
  reference: z.object({ helpers: z.string(), proof: z.array(z.string()).min(1) }),
});

export type Level = z.infer<typeof LevelSchema>;

export const PublicLevelSchema = LevelSchema.omit({ reference: true });

export type PublicLevel = z.infer<typeof PublicLevelSchema>;

export const LevelSummarySchema = LevelSchema.pick({ id: true, order: true, title: true, concept: true, par: true, helpers: true });

export type LevelSummary = z.infer<typeof LevelSummarySchema>;

export const toPublicLevel = ({ reference: _reference, ...rest }: Level): PublicLevel => rest;

export const toSummary = (level: Level | PublicLevel): LevelSummary => ({
  id: level.id,
  order: level.order,
  title: level.title,
  concept: level.concept,
  par: level.par,
  helpers: level.helpers,
});

export const levelBoards = (level: Pick<Level, "start" | "target">): { start: Board; target: Board } => ({
  start: parseBoard(level.start),
  target: parseBoard(level.target),
});
