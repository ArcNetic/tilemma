import type { CodeBoard } from "@pp/engine";
import type { View } from "./view.js";

export type Frame = {
  board: CodeBoard;
  line: number | null;
  sub: number | null;
  failed: boolean;
};

const startFrame = (board: CodeBoard): Frame => ({ board, line: null, sub: null, failed: false });

export const buildFrames = (view: View): Frame[] => {
  const frames: Frame[] = [startFrame(view.states[0] ?? [])];
  let current = 0;
  for (const entry of view.lineStates) {
    const substeps = entry.substeps ?? [];
    if (entry.stateIndex > current) {
      const boards = substeps.length > 0 ? substeps : [view.states[entry.stateIndex] ?? []];
      boards.forEach((board, sub) => frames.push({ board, line: entry.line, sub: substeps.length > 0 ? sub : null, failed: false }));
      current = entry.stateIndex;
    } else if (substeps.length > 0) {
      substeps.forEach((board, sub) => frames.push({ board, line: entry.line, sub, failed: true }));
    }
  }
  return frames;
};

export const positionForLine = (frames: readonly Frame[], line: number): number => {
  let position = 0;
  frames.forEach((frame, index) => {
    if (frame.line !== null && frame.line <= line) position = index;
  });
  return position;
};

export const clampPosition = (frames: readonly Frame[], position: number): number =>
  Math.max(0, Math.min(frames.length - 1, position));

export const lastPosition = (frames: readonly Frame[]): number => Math.max(0, frames.length - 1);
