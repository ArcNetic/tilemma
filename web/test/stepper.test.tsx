import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Stepper, stepLabel, timelineItems } from "../src/components/Stepper.js";
import type { Frame } from "../src/lib/frames.js";

// jsdom has no pointer capture; real browsers do.
Object.assign(HTMLElement.prototype, {
  setPointerCapture: vi.fn(),
  releasePointerCapture: vi.fn(),
  hasPointerCapture: vi.fn(() => false),
});

const frame = (line: number | null, sub: number | null = null, failed = false): Frame => ({ board: [], line, sub, failed });

// start, line 1, then line 2 expanded into three helper steps (the last one failed), then line 3
const frames: Frame[] = [frame(null), frame(1), frame(2, 0), frame(2, 1), frame(2, 2, true), frame(3)];

describe("timelineItems", () => {
  it("makes one node per frame and groups the sub-steps of one line", () => {
    expect(timelineItems(frames)).toEqual([
      { kind: "node", index: 0 },
      { kind: "node", index: 1 },
      { kind: "group", line: 2, indices: [2, 3, 4] },
      { kind: "node", index: 5 },
    ]);
  });

  it("keeps sub-steps of two different lines in two groups", () => {
    const two = [frame(null), frame(1, 0), frame(1, 1), frame(2, 0), frame(2, 1)];
    expect(timelineItems(two).map((item) => (item.kind === "group" ? item.indices : [item.index]))).toEqual([[0], [1, 2], [3, 4]]);
  });

  it("handles a proof with no moves", () => {
    expect(timelineItems([frame(null)])).toEqual([{ kind: "node", index: 0 }]);
    expect(timelineItems([])).toEqual([]);
  });
});

describe("timeline", () => {
  it("is a slider that reports the step it is on", () => {
    render(<Stepper frames={frames} position={3} onStep={() => undefined} />);
    const slider = screen.getByRole("slider", { name: "Proof timeline" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "5");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute("aria-valuetext", "Line 2, step 2");
  });

  it("marks done, current and ahead nodes and shows the failed one with a cross", () => {
    const { container } = render(<Stepper frames={frames} position={2} onStep={() => undefined} />);
    expect(container.querySelectorAll(".node-done")).toHaveLength(2);
    expect(container.querySelectorAll(".node-current")).toHaveLength(1);
    expect(container.querySelectorAll(".node-ahead")).toHaveLength(3);
    expect(container.querySelectorAll(".node-sub")).toHaveLength(3);
    const failed = container.querySelector(".node-failed");
    expect(failed?.querySelector("svg")).not.toBeNull();
    expect(failed?.getAttribute("data-index")).toBe("4");
  });

  it("labels each line under its node and each group once", () => {
    const { container } = render(<Stepper frames={frames} position={0} onStep={() => undefined} />);
    expect(Array.from(container.querySelectorAll(".node-line")).map((n) => n.textContent)).toEqual(["1", "2", "3"]);
  });

  it("moves with the arrow keys, Home and End, and clamps at the ends", async () => {
    const onStep = vi.fn();
    const { rerender } = render(<Stepper frames={frames} position={2} onStep={onStep} />);
    screen.getByRole("slider").focus();
    await userEvent.keyboard("{ArrowRight}{ArrowLeft}{Home}{End}");
    expect(onStep.mock.calls.map((c) => c[0])).toEqual([3, 1, 0, 5]);
    onStep.mockClear();
    rerender(<Stepper frames={frames} position={0} onStep={onStep} />);
    await userEvent.keyboard("{ArrowLeft}");
    expect(onStep).toHaveBeenLastCalledWith(0);
  });

  it("leaves Alt+Arrow to the global stepping shortcut", async () => {
    const onStep = vi.fn();
    render(<Stepper frames={frames} position={2} onStep={onStep} />);
    screen.getByRole("slider").focus();
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(onStep).not.toHaveBeenCalled();
  });

  it("is disabled when there is nothing to step through", () => {
    render(<Stepper frames={[frame(null)]} position={0} onStep={() => undefined} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
  });

  it("tells the editor which frame the pointer is over and clears it on leave", () => {
    const onHoverPosition = vi.fn();
    const { container } = render(<Stepper frames={frames} position={0} onStep={() => undefined} onHoverPosition={onHoverPosition} />);
    container.querySelectorAll<HTMLElement>(".node-slot").forEach((slot, i) => {
      slot.getBoundingClientRect = () => ({ left: i * 20, width: 10, right: i * 20 + 10, top: 0, bottom: 10, height: 10, x: i * 20, y: 0, toJSON: () => ({}) });
    });
    const slider = screen.getByRole("slider");
    fireEvent.pointerMove(slider, { clientX: 2 * 20 + 5, pointerId: 1 });
    expect(onHoverPosition).toHaveBeenLastCalledWith(2);
    fireEvent.pointerLeave(slider, { pointerId: 1 });
    expect(onHoverPosition).toHaveBeenLastCalledWith(null);
  });

  it("jumps to the node that was pressed", () => {
    const onStep = vi.fn();
    const { container } = render(<Stepper frames={frames} position={0} onStep={onStep} />);
    container.querySelectorAll<HTMLElement>(".node-slot").forEach((slot, i) => {
      slot.getBoundingClientRect = () => ({ left: i * 20, width: 10, right: i * 20 + 10, top: 0, bottom: 10, height: 10, x: i * 20, y: 0, toJSON: () => ({}) });
    });
    fireEvent.pointerDown(screen.getByRole("slider"), { clientX: 4 * 20 + 4, button: 0, pointerId: 1 });
    expect(onStep).toHaveBeenLastCalledWith(4);
  });
});

describe("stepLabel", () => {
  it("still labels the failed sub-step", () => {
    expect(stepLabel(frames[4])).toBe("Line 2, step 3 (failed)");
  });
});
