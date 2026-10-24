import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import type { SplitRatio } from "../hooks/useSplitRatio.js";
import { SPLITTER_PX, clampRatio, ratioBounds, ratioFromPointer } from "../lib/split.js";

export type SplitterProps = {
  /** "vertical" is a vertical bar between a left and a right pane. */
  orientation: "vertical" | "horizontal";
  label: string;
  /** Element whose size the ratio is a share of. */
  container: RefObject<HTMLElement | null>;
  ratio: SplitRatio;
  minFirstPx: number;
  minSecondPx: number;
  testId?: string;
};

const STEP = 2;
const BIG_STEP = 10;

export const Splitter = ({ orientation, label, container, ratio, minFirstPx, minSecondPx, testId }: SplitterProps) => {
  const vertical = orientation === "vertical";
  const grab = useRef<number | null>(null);

  const bounds = () => {
    const rect = container.current?.getBoundingClientRect();
    return ratioBounds(vertical ? (rect?.width ?? 0) : (rect?.height ?? 0), minFirstPx, minSecondPx, SPLITTER_PX);
  };

  const fromPointer = (event: PointerEvent<HTMLDivElement>): number | null => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect || grab.current === null) return null;
    const { lo, hi } = bounds();
    const raw = vertical
      ? ratioFromPointer(event.clientX, rect.left, rect.width, grab.current)
      : ratioFromPointer(event.clientY, rect.top, rect.height, grab.current);
    return clampRatio(raw, lo, hi);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    grab.current = vertical ? event.clientX - rect.left : event.clientY - rect.top;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const next = fromPointer(event);
    if (next !== null) ratio.preview(next);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const next = fromPointer(event);
    grab.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (next !== null) ratio.commit(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { lo, hi } = bounds();
    const step = event.shiftKey ? BIG_STEP : STEP;
    const less = vertical ? "ArrowLeft" : "ArrowUp";
    const more = vertical ? "ArrowRight" : "ArrowDown";
    let next: number | null = null;
    if (event.key === less) next = ratio.value - step;
    else if (event.key === more) next = ratio.value + step;
    else if (event.key === "Home") next = lo;
    else if (event.key === "End") next = hi;
    else if (event.key === "Enter") {
      event.preventDefault();
      ratio.reset();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    ratio.commit(clampRatio(next, lo, hi));
  };

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(ratio.value)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      data-testid={testId}
      title="Drag to resize. Arrow keys also work, Enter resets."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={ratio.reset}
      onKeyDown={onKeyDown}
    />
  );
};
