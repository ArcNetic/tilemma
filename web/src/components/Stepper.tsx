import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { Frame } from "../lib/frames.js";
import { CloseIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, StepBackIcon, StepForwardIcon } from "./icons.js";

export type StepperProps = {
  frames: readonly Frame[];
  position: number;
  onStep: (position: number) => void;
  /** Called with the frame under the pointer, or null when it leaves the timeline. */
  onHoverPosition?: (position: number | null) => void;
};

const PLAY_INTERVAL_MS = 750;

export const stepLabel = (frame: Frame | undefined): string => {
  if (!frame || frame.line === null) return "Start";
  const base = `Line ${frame.line}`;
  if (frame.sub === null) return base;
  return `${base}, step ${frame.sub + 1}${frame.failed ? " (failed)" : ""}`;
};

export type TimelineItem = { kind: "node"; index: number } | { kind: "group"; line: number; indices: number[] };

/** One node per frame. The sub-steps of a helper call sit together in a group under their line. */
export const timelineItems = (frames: readonly Frame[]): TimelineItem[] => {
  const items: TimelineItem[] = [];
  frames.forEach((frame, index) => {
    const last = items[items.length - 1];
    if (frame.sub !== null && frame.line !== null) {
      if (last?.kind === "group" && last.line === frame.line) last.indices.push(index);
      else items.push({ kind: "group", line: frame.line, indices: [index] });
    } else {
      items.push({ kind: "node", index });
    }
  });
  return items;
};

const TimelineNode = ({ index, frames, position, hover, register }: { index: number; frames: readonly Frame[]; position: number; hover: number | null; register: (index: number, el: HTMLElement | null) => void }) => {
  const frame = frames[index]!;
  const classes = [
    "node",
    frame.line === null ? "node-start" : "",
    frame.sub !== null ? "node-sub" : "",
    frame.failed ? "node-failed" : "",
    index < position ? "node-done" : index === position ? "node-current" : "node-ahead",
    hover === index ? "node-hover" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className="node-slot" ref={(el) => register(index, el)}>
      <span className={classes} data-index={index}>
        {frame.failed && <CloseIcon />}
      </span>
      {frame.line !== null && frame.sub === null && (
        <span className="node-line" aria-hidden="true">
          {frame.line}
        </span>
      )}
    </span>
  );
};

export const Stepper = ({ frames, position, onStep, onHoverPosition }: StepperProps) => {
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const nodes = useRef<(HTMLElement | null)[]>([]);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const last = Math.max(0, frames.length - 1);
  const items = useMemo(() => timelineItems(frames), [frames]);

  useEffect(() => {
    if (!playing) return;
    if (position >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => onStep(position + 1), PLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [playing, position, last, onStep]);

  const play = () => {
    if (position >= last) onStep(0);
    setPlaying(true);
  };

  const register = (index: number, el: HTMLElement | null) => {
    nodes.current[index] = el;
  };

  const nearest = (clientX: number): number | null => {
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    nodes.current.forEach((el, index) => {
      if (!el || index >= frames.length) return;
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  };

  const hoverTo = (next: number | null) => {
    setHover(next);
    onHoverPosition?.(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || last === 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    const target = nearest(event.clientX);
    if (target !== null) onStep(target);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const target = nearest(event.clientX);
    hoverTo(target);
    if (dragging.current && target !== null && target !== position) onStep(target);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onPointerLeave = () => {
    if (!dragging.current) hoverTo(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: position - 1, ArrowDown: position - 1, ArrowRight: position + 1, ArrowUp: position + 1, Home: 0, End: last };
    const next = moves[event.key];
    if (next === undefined || event.altKey) return;
    event.preventDefault();
    onStep(Math.max(0, Math.min(last, next)));
  };

  const tipLeft = (() => {
    if (hover === null || !track.current) return null;
    const el = nodes.current[hover];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return rect.left + rect.width / 2 - track.current.getBoundingClientRect().left;
  })();

  return (
    <div className="stepper" role="group" aria-label="Step through the proof">
      <div className="stepper-buttons">
        <button type="button" onClick={() => onStep(0)} disabled={position <= 0} aria-label="Jump to start" title="Jump to start">
          <SkipBackIcon />
        </button>
        <button type="button" onClick={() => onStep(position - 1)} disabled={position <= 0} aria-label="Previous step" title="Previous step (Alt+Left)">
          <StepBackIcon />
        </button>
        {playing ? (
          <button type="button" className="play" onClick={() => setPlaying(false)} aria-label="Pause" title="Pause">
            <PauseIcon />
          </button>
        ) : (
          <button type="button" className="play" onClick={play} disabled={last === 0} aria-label="Play" title="Play the proof">
            <PlayIcon />
          </button>
        )}
        <button type="button" onClick={() => onStep(position + 1)} disabled={position >= last} aria-label="Next step" title="Next step (Alt+Right)">
          <StepForwardIcon />
        </button>
        <button type="button" onClick={() => onStep(last)} disabled={position >= last} aria-label="Jump to end" title="Jump to end">
          <SkipForwardIcon />
        </button>
      </div>

      <div
        className="timeline"
        ref={track}
        role="slider"
        aria-label="Proof timeline"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={Math.min(position, last)}
        aria-valuetext={stepLabel(frames[position])}
        aria-disabled={last === 0 ? true : undefined}
        tabIndex={last === 0 ? -1 : 0}
        data-testid="timeline"
        style={{ "--frames": Math.max(1, frames.length) } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      >
        {items.map((item) =>
          item.kind === "node" ? (
            <TimelineNode key={item.index} index={item.index} frames={frames} position={position} hover={hover} register={register} />
          ) : (
            <span className="node-group" key={`g${item.indices[0]}`} style={{ flexGrow: item.indices.length }} data-line={item.line}>
              {item.indices.map((index) => (
                <TimelineNode key={index} index={index} frames={frames} position={position} hover={hover} register={register} />
              ))}
              <span className="node-line" aria-hidden="true">
                {item.line}
              </span>
            </span>
          ),
        )}
        {hover !== null && tipLeft !== null && (
          <span className="timeline-tip" style={{ left: tipLeft }} aria-hidden="true">
            {stepLabel(frames[hover])}
          </span>
        )}
      </div>

      <span className="step-label" aria-live="polite">
        {stepLabel(frames[position])} <span className="step-count">({position} / {last})</span>
      </span>
    </div>
  );
};
