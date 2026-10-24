import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardView } from "../src/components/BoardView.js";
import { EditorActions } from "../src/components/EditorActions.js";
import { SuccessOverlay, makeConfetti } from "../src/components/SuccessOverlay.js";
import { useDelayedFlag } from "../src/hooks/useDelayedFlag.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const red = [["R.", "G."]];
const painted = [["B.", "G."]];

describe("paint", () => {
  it("shows the old colour shrinking away when a tile is repainted, and removes it afterwards", () => {
    const { container, rerender } = render(<BoardView title="Board" board={red} />);
    expect(container.querySelector(".cell-ink")).toBeNull();
    rerender(<BoardView title="Board" board={painted} />);
    const ink = container.querySelector(".cell-ink");
    expect(ink).not.toBeNull();
    expect(ink).toHaveClass("color-R");
    expect(ink?.parentElement).toHaveClass("color-B");
    // jsdom has no CSS animation property, so React listens for the prefixed event name there; browsers send the standard one.
    fireEvent(ink!, new Event("animationend", { bubbles: true }));
    fireEvent(ink!, new Event("webkitAnimationEnd", { bubbles: true }));
    expect(container.querySelector(".cell-ink")).toBeNull();
  });

  it("does not animate a tile whose colour did not change", () => {
    const { container, rerender } = render(<BoardView title="Board" board={red} />);
    rerender(<BoardView title="Board" board={[["R.", "B."]]} />);
    expect(container.querySelectorAll(".cell-ink")).toHaveLength(1);
    expect(container.querySelector(".cell-ink")?.parentElement).toHaveAttribute("data-col", "1");
  });
});

describe("swap", () => {
  it("lifts a tile while it moves to a new slot and puts it down again", () => {
    // Two tiles trade places: the tracked ids stay with the tiles, so each tile gets a new row/col.
    const ids = [[0, 1]];
    const swapped = [[1, 0]];
    const tracked = (order: number[][]) => ({ ids: order, rotations: [[0, 0]] });
    const { container, rerender } = render(<BoardView title="Board" board={[["R.", "G."]]} tracked={tracked(ids)} />);
    expect(container.querySelectorAll(".cell-moving")).toHaveLength(0);
    rerender(<BoardView title="Board" board={[["G.", "R."]]} tracked={tracked(swapped)} />);
    expect(container.querySelectorAll(".cell-moving")).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(container.querySelectorAll(".cell-moving")).toHaveLength(0);
  });
});

describe("the badge", () => {
  it("shows a spinner while Lean checks and a check mark once it has confirmed", () => {
    const { container, rerender } = render(<BoardView title="Board" board={red} badge="Preview" badgeTone="working" />);
    expect(container.querySelector(".badge-working .badge-spinner")).not.toBeNull();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    rerender(<BoardView title="Board" board={red} badge="Verified by Lean" badgeTone="verified" />);
    expect(container.querySelector(".badge-verified svg")).not.toBeNull();
    expect(container.querySelector(".badge-spinner")).toBeNull();
    expect(container.querySelector(".badge")).toHaveTextContent(/^Verified by Lean$/);
  });

  it("stamps the badge and glows a clean board for a moment when verification arrives, not on first render", () => {
    const { container, rerender } = render(<BoardView title="Board" board={red} badge="Verified by Lean" badgeTone="verified" />);
    expect(container.querySelector(".badge-stamp")).toBeNull();
    rerender(<BoardView title="Board" board={red} badge="Preview" badgeTone="working" />);
    rerender(<BoardView title="Board" board={red} badge="Verified by Lean" badgeTone="verified" />);
    expect(container.querySelector(".badge-stamp")).not.toBeNull();
    expect(container.querySelector(".board-panel")).toHaveClass("verify-flash");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".badge-stamp")).toBeNull();
    expect(container.querySelector(".board-panel")).not.toHaveClass("verify-flash");
  });

  it("stamps the badge but does not glow a board that has an error", () => {
    const { container, rerender } = render(<BoardView title="Board" board={red} badge="Preview" badgeTone="working" errorCells={[[0, 0]]} />);
    rerender(<BoardView title="Board" board={red} badge="Verified by Lean" badgeTone="verified" errorCells={[[0, 0]]} />);
    expect(container.querySelector(".badge-stamp")).not.toBeNull();
    expect(container.querySelector(".board-panel")).not.toHaveClass("verify-flash");
  });
});

describe("solved", () => {
  it("marks the board and gives every tile its place in the wave from the top left", () => {
    const board = [
      ["R.", "G."],
      ["B.", "Y."],
    ];
    const { container } = render(<BoardView title="Board" board={board} solved />);
    expect(container.querySelector(".board-panel")).toHaveClass("board-solved");
    const waves = Array.from(container.querySelectorAll<HTMLElement>(".cell")).map((c) => c.style.getPropertyValue("--wave"));
    expect(waves).toEqual(["0", "1", "1", "2"]);
  });

  it("is not marked solved by default", () => {
    const { container } = render(<BoardView title="Board" board={red} />);
    expect(container.querySelector(".board-panel")).not.toHaveClass("board-solved");
  });
});

describe("useDelayedFlag", () => {
  it("turns on after the delay, off at once, and skips the wait when the delay is zero", () => {
    const { result, rerender } = renderHook(({ on, ms }) => useDelayedFlag(on, ms), { initialProps: { on: false, ms: 500 } });
    expect(result.current).toBe(false);
    rerender({ on: true, ms: 500 });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current).toBe(true);
    rerender({ on: false, ms: 500 });
    expect(result.current).toBe(false);
    rerender({ on: true, ms: 0 });
    expect(result.current).toBe(true);
  });

  it("does not turn on if the value goes away before the delay ends", () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 400), { initialProps: { on: true } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ on: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });
});

describe("EditorActions busy state", () => {
  it("shows a spinner and aria-busy while Lean is checking", () => {
    const { rerender } = render(<EditorActions onHint={() => undefined} onReset={() => undefined} hintShown={false} />);
    expect(screen.getByRole("status")).not.toHaveAttribute("aria-busy");
    rerender(<EditorActions onHint={() => undefined} onReset={() => undefined} hintShown={false} checking />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".run-spinner")).not.toBeNull();
  });
});

describe("confetti", () => {
  it("is the same every time, in all eight block colours and three shapes, with varied sizes", () => {
    const a = makeConfetti(56);
    expect(makeConfetti(56)).toEqual(a);
    expect(new Set(a.map((p) => p.color))).toEqual(new Set(["R", "G", "B", "Y", "P", "O", "W", "K"]));
    expect(new Set(a.map((p) => p.shape))).toEqual(new Set(["strip", "square", "dot"]));
    expect(new Set(a.map((p) => p.size)).size).toBeGreaterThan(4);
  });

  it("falls within about three seconds and starts inside the screen", () => {
    for (const p of makeConfetti(56)) {
      expect(p.dur + p.delay).toBeLessThanOrEqual(3.1);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
    }
  });

  it("is decorative: hidden from assistive tech, and made of block-colour pieces", () => {
    const props = { title: "First Swap", moves: 2, par: 2, stars: 3, axiomsOk: true, hasNext: true, onNext: vi.fn(), onClose: vi.fn() };
    const { container } = render(<SuccessOverlay open {...props} />);
    const confetti = container.querySelector(".confetti");
    expect(confetti).toHaveAttribute("aria-hidden", "true");
    expect(confetti?.querySelectorAll(".piece")).toHaveLength(56);
    expect(confetti?.querySelector(".piece.color-R")).not.toBeNull();
  });
});

describe("success card", () => {
  const props = { title: "First Swap", moves: 2, par: 2, stars: 2, axiomsOk: true, hasNext: true, onNext: vi.fn(), onClose: vi.fn() };

  it("staggers the stars and keeps the verified wording in one badge", () => {
    const { container } = render(<SuccessOverlay open {...props} />);
    const stars = Array.from(container.querySelectorAll<HTMLElement>(".stars .star"));
    expect(stars.map((s) => s.style.getPropertyValue("--i"))).toEqual(["0", "1", "2"]);
    expect(stars.filter((s) => s.classList.contains("on"))).toHaveLength(2);
    expect(screen.getByTestId("verified-badge")).toHaveTextContent("Verified by the Lean kernel (no sorry, no extra axioms)");
    expect(screen.getByTestId("verified-badge").querySelector("svg")).not.toBeNull();
  });

  it("leaves out the axiom note when it is not confirmed", () => {
    render(<SuccessOverlay open {...props} axiomsOk={false} />);
    expect(screen.getByTestId("verified-badge")).toHaveTextContent(/^Verified by the Lean kernel$/);
  });
});
