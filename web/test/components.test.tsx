import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardView } from "../src/components/BoardView.js";
import { LevelDrawer } from "../src/components/LevelDrawer.js";
import { Stepper, stepLabel } from "../src/components/Stepper.js";
import { StatusBar } from "../src/components/StatusBar.js";
import { SuccessOverlay } from "../src/components/SuccessOverlay.js";
import { ghostFor, describeCell, insideCells, outsideCells } from "../src/lib/cellInfo.js";
import type { Frame } from "../src/lib/frames.js";
import { statusMessage, type StatusInput } from "../src/lib/status.js";

const board = [
  ["R^", "G.#"],
  ["Bv", "W<"],
];

describe("BoardView", () => {
  it("renders every cell with an accessible description", () => {
    render(<BoardView title="Your board" board={board} />);
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByLabelText("Row 0, column 0: red, arrow north")).toBeInTheDocument();
    expect(screen.getByLabelText("Row 0, column 1: green, locked")).toBeInTheDocument();
    expect(screen.getByLabelText("Row 1, column 0: blue, arrow south")).toBeInTheDocument();
    expect(screen.getByLabelText("Row 1, column 1: white, arrow west")).toBeInTheDocument();
  });

  it("shows color letters for colorblind players, arrows and lock badges only where they belong", () => {
    const { container } = render(<BoardView title="Board" board={board} />);
    expect(Array.from(container.querySelectorAll(".cell-letter")).map((n) => n.textContent)).toEqual(["R", "G", "B", "W"]);
    expect(container.querySelectorAll(".arrow")).toHaveLength(3);
    expect(container.querySelectorAll(".lock")).toHaveLength(1);
    expect(container.querySelector(".color-G .lock")).not.toBeNull();
  });

  it("labels row and column numbers", () => {
    const { container } = render(<BoardView title="Board" board={board} />);
    expect(container.querySelector(".col-labels")?.textContent).toBe("01");
    expect(container.querySelector(".row-labels")?.textContent).toBe("01");
  });

  it("marks failing cells red and shows a ghost for out-of-bounds cells", () => {
    const { container } = render(<BoardView title="Board" board={board} errorCells={[[0, 1], [0, 5]]} />);
    expect(container.querySelectorAll(".cell-error")).toHaveLength(1);
    expect(screen.getByLabelText("Row 0, column 1: green, locked")).toHaveClass("cell-error");
    const ghost = screen.getByRole("img", { name: "(0, 5) is outside the board" });
    expect(ghost).toHaveClass("ghost-right");
  });

  it("highlights mismatched cells", () => {
    const { container } = render(<BoardView title="Board" board={board} mismatchCells={[[1, 0]]} />);
    expect(container.querySelectorAll(".cell-mismatch")).toHaveLength(1);
  });

  it("shows the preview badge", () => {
    render(<BoardView title="Board" board={board} badge="Preview" />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("makes cells clickable and reports their coordinates", async () => {
    const onCellClick = vi.fn();
    render(<BoardView title="Board" board={board} onCellClick={onCellClick} />);
    await userEvent.click(screen.getByLabelText("Row 1, column 0: blue, arrow south"));
    expect(onCellClick).toHaveBeenCalledWith(1, 0);
    screen.getByLabelText("Row 0, column 0: red, arrow north").focus();
    await userEvent.keyboard("{Enter}");
    expect(onCellClick).toHaveBeenLastCalledWith(0, 0);
  });

  it("is not interactive without a click handler", () => {
    render(<BoardView title="Board" board={board} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("rotates arrows to match their direction when untracked", () => {
    const { container } = render(<BoardView title="Board" board={board} />);
    expect(container.querySelectorAll(".arrow")).toHaveLength(3);
  });
});

describe("cell helpers", () => {
  it("describes cells", () => {
    expect(describeCell("K.", 2, 3)).toBe("Row 2, column 3: black");
    expect(describeCell("Y>#", 0, 0)).toBe("Row 0, column 0: yellow, arrow east, locked");
  });

  it("places ghosts on the nearest edge", () => {
    expect(ghostFor([-1, 1], 3, 3)).toMatchObject({ row: 0, col: 1, side: "top" });
    expect(ghostFor([3, 1], 3, 3)).toMatchObject({ row: 2, col: 1, side: "bottom" });
    expect(ghostFor([1, -2], 3, 3)).toMatchObject({ row: 1, col: 0, side: "left" });
    expect(ghostFor([1, 9], 3, 3)).toMatchObject({ row: 1, col: 2, side: "right" });
  });

  it("splits cells into inside and outside", () => {
    const cells = [[0, 0], [5, 5], [1, 2]] as const;
    expect(insideCells(cells, 3, 3)).toEqual([[0, 0], [1, 2]]);
    expect(outsideCells(cells, 3, 3)).toEqual([[5, 5]]);
  });
});

const frames: Frame[] = [
  { board: [], line: null, sub: null, failed: false },
  { board: [], line: 1, sub: null, failed: false },
  { board: [], line: 2, sub: 0, failed: false },
  { board: [], line: 2, sub: 1, failed: false },
];

describe("Stepper", () => {
  afterEach(() => vi.useRealTimers());

  it("labels start, line and sub-step frames", () => {
    expect(stepLabel(frames[0])).toBe("Start");
    expect(stepLabel(frames[1])).toBe("Line 1");
    expect(stepLabel(frames[3])).toBe("Line 2, step 2");
    expect(stepLabel({ ...frames[3]!, failed: true })).toBe("Line 2, step 2 (failed)");
    expect(stepLabel(undefined)).toBe("Start");
  });

  it("disables backward buttons at the start and forward buttons at the end", () => {
    const { rerender } = render(<Stepper frames={frames} position={0} onStep={() => undefined} />);
    expect(screen.getByLabelText("Jump to start")).toBeDisabled();
    expect(screen.getByLabelText("Previous step")).toBeDisabled();
    expect(screen.getByLabelText("Next step")).toBeEnabled();
    rerender(<Stepper frames={frames} position={3} onStep={() => undefined} />);
    expect(screen.getByLabelText("Next step")).toBeDisabled();
    expect(screen.getByLabelText("Jump to end")).toBeDisabled();
    expect(screen.getByLabelText("Previous step")).toBeEnabled();
  });

  it("steps by one and jumps to either end", async () => {
    const onStep = vi.fn();
    render(<Stepper frames={frames} position={2} onStep={onStep} />);
    await userEvent.click(screen.getByLabelText("Next step"));
    expect(onStep).toHaveBeenLastCalledWith(3);
    await userEvent.click(screen.getByLabelText("Previous step"));
    expect(onStep).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByLabelText("Jump to start"));
    expect(onStep).toHaveBeenLastCalledWith(0);
    await userEvent.click(screen.getByLabelText("Jump to end"));
    expect(onStep).toHaveBeenLastCalledWith(3);
  });

  it("plays forward automatically and stops at the end", () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    const { rerender } = render(<Stepper frames={frames} position={0} onStep={onStep} />);
    act(() => screen.getByLabelText("Play").click());
    act(() => vi.advanceTimersByTime(800));
    expect(onStep).toHaveBeenCalledWith(1);
    rerender(<Stepper frames={frames} position={3} onStep={onStep} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("shows the position counter", () => {
    render(<Stepper frames={frames} position={2} onStep={() => undefined} />);
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument();
  });
});

const baseStatus: StatusInput = {
  status: "PENDING",
  source: "preview",
  diagnostics: [],
  checking: false,
  mismatchCount: 0,
  hasProof: true,
  needsLean: false,
  offline: false,
};

describe("statusMessage", () => {
  const diag = { pane: "proof", line: 3, colStart: 0, colEnd: 5, severity: "error", code: "LOCKED", message: "Block (0, 1) is locked and cannot be changed." } as const;

  it("explains each outcome in plain English", () => {
    expect(statusMessage({ ...baseStatus, status: "SOLVED" })).toMatchObject({ tone: "success" });
    expect(statusMessage({ ...baseStatus, status: "INCOMPLETE", mismatchCount: 1 }).text).toContain("1 block still differs");
    expect(statusMessage({ ...baseStatus, status: "INCOMPLETE", mismatchCount: 3 }).text).toContain("3 blocks still differ");
    expect(statusMessage({ ...baseStatus, status: "ILLEGAL", diagnostics: [diag] }).text).toBe("Line 3: Block (0, 1) is locked and cannot be changed.");
    expect(statusMessage({ ...baseStatus, status: "TIMEOUT" }).tone).toBe("error");
    expect(statusMessage({ ...baseStatus, status: "BUSY" }).tone).toBe("warning");
    expect(statusMessage({ ...baseStatus, status: "INTERNAL_ERROR" }).tone).toBe("error");
  });

  it("names the helpers pane for helper diagnostics", () => {
    const text = statusMessage({ ...baseStatus, status: "SYNTAX_ERROR", diagnostics: [{ ...diag, pane: "helpers", line: 2 }] }).text;
    expect(text.startsWith("Helpers, line 2:")).toBe(true);
  });

  it("guides an empty proof and shows progress while checking", () => {
    expect(statusMessage({ ...baseStatus, hasProof: false }).tone).toBe("neutral");
    expect(statusMessage({ ...baseStatus, checking: true }).text).toBe("Checking with Lean...");
    expect(statusMessage({ ...baseStatus, needsLean: true }).tone).toBe("working");
  });

  it("shows instant preview errors while Lean confirms", () => {
    const message = statusMessage({ ...baseStatus, diagnostics: [diag], checking: true });
    expect(message.tone).toBe("error");
    expect(message.detail).toBe("Confirming with Lean...");
  });

  it("reports offline mode first", () => {
    expect(statusMessage({ ...baseStatus, status: "SOLVED", offline: true }).tone).toBe("warning");
  });
});

describe("StatusBar", () => {
  it("renders text, detail and timing", () => {
    render(<StatusBar message={{ tone: "error", text: "Nope", detail: "More" }} leanMs={321} />);
    const bar = screen.getByTestId("status-bar");
    expect(bar).toHaveClass("tone-error");
    expect(within(bar).getByText("Nope")).toBeInTheDocument();
    expect(within(bar).getByText("Lean 321 ms")).toBeInTheDocument();
  });

  it("hides timing when there is none", () => {
    render(<StatusBar message={{ tone: "neutral", text: "Hi" }} leanMs={null} />);
    expect(screen.queryByText(/Lean \d+ ms/)).toBeNull();
  });
});

describe("SuccessOverlay", () => {
  const props = { title: "First Swap", moves: 2, par: 2, stars: 3, axiomsOk: true, hasNext: true, onNext: vi.fn(), onClose: vi.fn() };

  it("renders nothing when closed", () => {
    render(<SuccessOverlay open={false} {...props} />);
    expect(screen.queryByTestId("success-overlay")).toBeNull();
  });

  it("shows the Lean kernel badge, stars and move count", () => {
    render(<SuccessOverlay open {...props} />);
    expect(screen.getByTestId("verified-badge")).toHaveTextContent("Verified by the Lean kernel (no sorry, no extra axioms)");
    expect(screen.getByLabelText("3 of 3 stars")).toBeInTheDocument();
    expect(screen.getByText("2 lines · goal 2")).toBeInTheDocument();
  });

  it("offers the next level and closes on Escape", async () => {
    const onNext = vi.fn();
    const onClose = vi.fn();
    render(<SuccessOverlay open {...props} onNext={onNext} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Next level" }));
    expect(onNext).toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("omits the next button on the last level", () => {
    render(<SuccessOverlay open {...props} hasNext={false} />);
    expect(screen.queryByRole("button", { name: "Next level" })).toBeNull();
  });
});

describe("LevelDrawer", () => {
  const levels = [
    { id: "L01", order: 1, title: "First", concept: "swap", par: 2, helpers: "none" as const },
    { id: "L02", order: 2, title: "Second", concept: "paint", par: 2, helpers: "none" as const },
    { id: "L03", order: 3, title: "Third", concept: "rotate", par: 2, helpers: "none" as const },
  ];

  it("locks levels until the previous one is solved", () => {
    render(<LevelDrawer open levels={levels} currentId="L01" progress={{ L01: { best: 2, stars: 3 } }} unlockAll={false} onToggleUnlockAll={() => undefined} onSelect={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: /First/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Second/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Third/ })).toBeDisabled();
  });

  it("unlocks everything in demo mode and selects a level", async () => {
    const onSelect = vi.fn();
    render(<LevelDrawer open levels={levels} currentId="L01" progress={{}} unlockAll onToggleUnlockAll={() => undefined} onSelect={onSelect} onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: /Third/ }));
    expect(onSelect).toHaveBeenCalledWith("L03");
  });

  it("shows stars for solved levels", () => {
    render(<LevelDrawer open levels={levels} currentId="L01" progress={{ L01: { best: 2, stars: 2 } }} unlockAll={false} onToggleUnlockAll={() => undefined} onSelect={() => undefined} onClose={() => undefined} />);
    expect(screen.getByLabelText("2 stars")).toBeInTheDocument();
  });
});
