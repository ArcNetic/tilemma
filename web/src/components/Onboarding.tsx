import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Placement = "bottom" | "inside" | "above";

type Step = { title: string; body: string; anchor: string; placement: Placement };

const STEPS: Step[] = [
  {
    title: "1. Read the boards",
    body: "The big board is yours. The small card is the target you are aiming for. Rows and columns count from 0 at the top left.",
    anchor: '[data-testid="board-current"]',
    placement: "bottom",
  },
  {
    title: "2. Write one move per line",
    body: "Try swap (0, 0) (0, 1). The board updates after every line. Click a block to insert its coordinates.",
    anchor: ".pane-proof",
    placement: "inside",
  },
  {
    title: "3. Lean checks every line",
    body: "A block that breaks the rules turns red and the proof stops. The reason appears here. When the board matches the target, the Lean kernel accepts it.",
    anchor: '[data-testid="status-bar"]',
    placement: "above",
  },
];

const MARGIN = 8;
const GAP = 12;
const CARD_WIDTH = 340;

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));

type Position = { left: number; top: number; width: number; ring: { left: number; top: number; width: number; height: number } | null };

export type OnboardingProps = {
  onDone: () => void;
};

export const Onboarding = ({ onDone }: OnboardingProps) => {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const card = useRef<HTMLElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;

  // Put the card next to the part of the screen it talks about, and keep it there as the window changes.
  useLayoutEffect(() => {
    const anchor = document.querySelector<HTMLElement>(step.anchor);
    anchor?.scrollIntoView({ block: "nearest", inline: "nearest" });

    const place = () => {
      const el = card.current;
      if (!el) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = anchor?.getBoundingClientRect() ?? null;
      let placement = step.placement;
      let width = Math.min(CARD_WIDTH, vw - 2 * MARGIN);
      if (rect && placement === "inside") {
        if (rect.width - 24 < 240 || rect.height < 300) placement = "bottom";
        else width = Math.min(CARD_WIDTH, rect.width - 24);
      }
      el.style.width = `${width}px`;
      const height = el.offsetHeight;
      let left = (vw - width) / 2;
      let top = (vh - height) / 3;
      if (rect) {
        if (placement === "bottom") {
          left = rect.left + rect.width / 2 - width / 2;
          top = rect.bottom + GAP;
          if (top + height > vh - MARGIN) top = rect.top - height - GAP;
        } else if (placement === "inside") {
          // A few lines down, so the first lines being typed stay visible.
          left = rect.left + 12;
          top = rect.top + 112;
        } else {
          left = rect.right - width;
          top = rect.top - height - GAP;
        }
      }
      setPosition({
        left: clamp(left, MARGIN, Math.max(MARGIN, vw - width - MARGIN)),
        top: clamp(top, MARGIN, Math.max(MARGIN, vh - height - MARGIN)),
        width,
        ring: rect ? { left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 } : null,
      });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step]);

  // Focus the main button once the card is placed (a hidden element cannot take focus).
  const placed = position !== null;
  useEffect(() => {
    if (placed) primary.current?.focus({ preventScroll: true });
  }, [index, placed]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  return (
    <>
      {position?.ring && <div className="coach-ring" aria-hidden="true" style={position.ring} />}
      <section
        ref={card}
        className="onboarding coach"
        aria-label="How to play"
        data-testid="onboarding"
        style={position ? { left: position.left, top: position.top, width: position.width } : { visibility: "hidden" }}
      >
        <h2>{step.title}</h2>
        <p>{step.body}</p>
        <div className="onboarding-actions">
          <button type="button" onClick={onDone}>
            Skip
          </button>
          <span className="onboarding-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={i === index ? "on" : ""} />
            ))}
          </span>
          <button type="button" className="primary" ref={primary} onClick={last ? onDone : () => setIndex(index + 1)}>
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </section>
    </>
  );
};
