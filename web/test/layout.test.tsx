import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorActions } from "../src/components/EditorActions.js";
import { EditorPane } from "../src/components/EditorPane.js";
import { Splitter } from "../src/components/Splitter.js";
import { StatusBar } from "../src/components/StatusBar.js";
import type { SplitRatio } from "../src/hooks/useSplitRatio.js";
import { SPLIT_MAX, SPLIT_MIN, clampRatio, ratioBounds, ratioFromPointer, readRatio, writeRatio } from "../src/lib/split.js";

// jsdom has no pointer capture; real browsers do.
Object.assign(HTMLElement.prototype, {
  setPointerCapture: vi.fn(),
  releasePointerCapture: vi.fn(),
  hasPointerCapture: vi.fn(() => false),
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("split ratios", () => {
  it("clamps into range", () => {
    expect(clampRatio(5, 15, 85)).toBe(15);
    expect(clampRatio(95, 15, 85)).toBe(85);
    expect(clampRatio(40, 15, 85)).toBe(40);
  });

  it("reads a saved ratio, clamped, and falls back on junk", () => {
    expect(readRatio("k", 42, 15, 85)).toBe(42);
    localStorage.setItem("k", "60");
    expect(readRatio("k", 42, 15, 85)).toBe(60);
    localStorage.setItem("k", "400");
    expect(readRatio("k", 42, 15, 85)).toBe(85);
    localStorage.setItem("k", "not a number");
    expect(readRatio("k", 42, 15, 85)).toBe(42);
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readRatio("k", 42, 15, 85)).toBe(42);
    expect(() => writeRatio("k", 50)).not.toThrow();
  });

  it("keeps both panes at their minimum size", () => {
    const { lo, hi } = ratioBounds(1000, 320, 460, 12);
    expect(lo).toBeCloseTo(32);
    expect(hi).toBeCloseTo(52.8);
    expect(ratioBounds(0, 320, 460, 12)).toEqual({ lo: SPLIT_MIN, hi: SPLIT_MAX });
    expect(ratioBounds(700, 320, 460, 12)).toEqual({ lo: 50, hi: 50 });
  });

  it("turns a pointer position into a ratio", () => {
    expect(ratioFromPointer(500, 0, 1000, 0)).toBe(50);
    expect(ratioFromPointer(506, 0, 1000, 6)).toBe(50);
    expect(ratioFromPointer(10, 0, 0, 0)).toBe(50);
  });
});

const makeRatio = (value: number): SplitRatio & { calls: string[] } => {
  const calls: string[] = [];
  return {
    value,
    calls,
    preview: (v) => calls.push(`preview ${v}`),
    commit: (v) => calls.push(`commit ${v}`),
    reset: () => calls.push("reset"),
  };
};

const container = (): RefObject<HTMLElement | null> => createRef<HTMLElement>();

describe("Splitter", () => {
  it("is a labelled, focusable separator with its value", () => {
    render(<Splitter orientation="vertical" label="Resize the editor and the board" container={container()} ratio={makeRatio(42)} minFirstPx={320} minSecondPx={460} />);
    const bar = screen.getByRole("separator", { name: "Resize the editor and the board" });
    expect(bar).toHaveAttribute("aria-orientation", "vertical");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("tabindex", "0");
  });

  it("moves with the arrow keys that match its orientation", async () => {
    const ratio = makeRatio(42);
    render(<Splitter orientation="vertical" label="v" container={container()} ratio={ratio} minFirstPx={320} minSecondPx={460} />);
    screen.getByRole("separator").focus();
    await userEvent.keyboard("{ArrowRight}{ArrowLeft}{Shift>}{ArrowRight}{/Shift}{ArrowUp}");
    expect(ratio.calls).toEqual(["commit 44", "commit 40", "commit 52"]);
  });

  it("uses up and down for a horizontal bar", async () => {
    const ratio = makeRatio(40);
    render(<Splitter orientation="horizontal" label="h" container={container()} ratio={ratio} minFirstPx={112} minSecondPx={112} />);
    screen.getByRole("separator").focus();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{ArrowLeft}");
    expect(ratio.calls).toEqual(["commit 42", "commit 38"]);
  });

  it("jumps to the ends with Home and End and resets with Enter or a double click", async () => {
    const ratio = makeRatio(42);
    render(<Splitter orientation="vertical" label="v" container={container()} ratio={ratio} minFirstPx={320} minSecondPx={460} />);
    const bar = screen.getByRole("separator");
    bar.focus();
    await userEvent.keyboard("{Home}{End}{Enter}");
    await userEvent.dblClick(bar);
    expect(ratio.calls).toEqual([`commit ${SPLIT_MIN}`, `commit ${SPLIT_MAX}`, "reset", "reset"]);
  });
});

describe("StatusBar heading", () => {
  it("shows a heading above the message when given one", () => {
    render(<StatusBar message={{ tone: "error", text: "Line 2: Block (0, 1) is locked and cannot be changed." }} heading="Proof failed" leanMs={null} />);
    const bar = screen.getByTestId("status-bar");
    expect(bar).toHaveClass("tone-error");
    expect(bar.querySelector(".status-heading")).toHaveTextContent("Proof failed");
    expect(bar.querySelector(".status-text")).toHaveTextContent("Line 2: Block (0, 1) is locked and cannot be changed.");
  });

  it("has no heading by default", () => {
    render(<StatusBar message={{ tone: "neutral", text: "Write one move per line." }} leanMs={null} />);
    expect(screen.getByTestId("status-bar").querySelector(".status-heading")).toBeNull();
  });
});

describe("EditorActions", () => {
  it("names the buttons Show Lean, Hint and Reset and calls back", async () => {
    const onShowLean = vi.fn();
    const onHint = vi.fn();
    const onReset = vi.fn();
    render(<EditorActions onShowLean={onShowLean} onHint={onHint} onReset={onReset} hintShown={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Show Lean" }));
    await userEvent.click(screen.getByRole("button", { name: "Hint" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onShowLean).toHaveBeenCalledOnce();
    expect(onHint).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("reflects the hint state", () => {
    render(<EditorActions onHint={vi.fn()} onReset={vi.fn()} hintShown />);
    expect(screen.getByRole("button", { name: "Hint" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("EditorPane", () => {
  it("shows an error count only when there are errors", () => {
    const { rerender } = render(
      <EditorPane title="Helpers">
        <div />
      </EditorPane>,
    );
    expect(screen.getByRole("region", { name: "Helpers" })).toBeInTheDocument();
    expect(screen.queryByText(/error/)).toBeNull();
    rerender(
      <EditorPane title="Helpers" errorCount={1}>
        <div />
      </EditorPane>,
    );
    expect(screen.getByText("1 error")).toBeInTheDocument();
    rerender(
      <EditorPane title="Helpers" errorCount={3}>
        <div />
      </EditorPane>,
    );
    expect(screen.getByText("3 errors")).toBeInTheDocument();
  });
});
