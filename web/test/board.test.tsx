import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BoardView } from "../src/components/BoardView.js";

const board = [
  ["R^", "G.#"],
  ["Bv", "W<"],
];

describe("board tiles", () => {
  it("sits every tile in a recessed slot", () => {
    const { container } = render(<BoardView title="Board" board={board} />);
    expect(container.querySelectorAll(".slot")).toHaveLength(4);
    expect(container.querySelectorAll(".slot[aria-hidden='true']")).toHaveLength(4);
  });

  it("marks locked tiles so they can look flush in their slot", () => {
    const { container } = render(<BoardView title="Board" board={board} />);
    expect(container.querySelectorAll(".cell-locked")).toHaveLength(1);
    expect(container.querySelector(".cell-locked")).toHaveClass("color-G");
  });

  it("exposes each tile's coordinate for its tooltip", () => {
    const { container } = render(<BoardView title="Board" board={board} />);
    expect(container.querySelector(".cell[data-row='1'][data-col='0']")).toHaveAttribute("data-coord", "(1, 0)");
  });

  it("adds a decorative error chip to the failing tile, not just a colour", () => {
    const { container } = render(<BoardView title="Board" board={board} errorCells={[[0, 1]]} />);
    const failing = container.querySelector(".cell-error");
    expect(failing?.querySelector(".cell-flag-error")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".cell-flag-error")).toHaveLength(1);
    expect(container.querySelectorAll(".cell-flag-diff")).toHaveLength(0);
  });

  it("adds a ring and a chip, with a different shape from the error chip, to tiles that differ from the target", () => {
    const { container } = render(<BoardView title="Board" board={board} mismatchCells={[[1, 0], [1, 1]]} />);
    expect(container.querySelectorAll(".cell-mismatch .cell-ring")).toHaveLength(2);
    expect(container.querySelectorAll(".cell-mismatch .cell-flag-diff")).toHaveLength(2);
    expect(container.querySelectorAll(".cell-flag-error")).toHaveLength(0);
  });

  it("keeps decorative chips out of the accessibility tree", () => {
    render(<BoardView title="Board" board={board} errorCells={[[0, 1]]} mismatchCells={[[1, 0]]} />);
    expect(screen.getAllByRole("img")).toHaveLength(4);
  });
});

describe("ghost slot", () => {
  it("draws a slot below the board for a row past the bottom edge and labels it with the coordinate", () => {
    render(<BoardView title="Board" board={board} errorCells={[[5, 0]]} />);
    const ghost = screen.getByRole("img", { name: "(5, 0) is outside the board" });
    expect(ghost).toHaveClass("ghost", "ghost-bottom");
    expect(ghost).toHaveTextContent("(5, 0)");
    expect(ghost.style.getPropertyValue("--ghost-col")).toBe("0");
  });

  it("draws a slot beside the board for a column past the right edge, in the row that was aimed at", () => {
    render(<BoardView title="Board" board={board} errorCells={[[1, 3]]} />);
    const ghost = screen.getByRole("img", { name: "(1, 3) is outside the board" });
    expect(ghost).toHaveClass("ghost-right");
    expect(ghost.style.getPropertyValue("--ghost-row")).toBe("1");
  });

  it("does not turn an in-bounds failure into a ghost", () => {
    const { container } = render(<BoardView title="Board" board={board} errorCells={[[0, 1]]} />);
    expect(container.querySelectorAll(".ghost")).toHaveLength(0);
  });
});

describe("row and column labels", () => {
  it("highlight the row and column of the hovered tile and clear on leave", async () => {
    const { container } = render(<BoardView title="Board" board={board} onCellClick={() => undefined} />);
    const tile = screen.getByLabelText("Row 1, column 0: blue, arrow south");
    await userEvent.hover(tile);
    expect(container.querySelector(".col-labels .on")?.textContent).toBe("0");
    expect(container.querySelector(".row-labels .on")?.textContent).toBe("1");
    await userEvent.unhover(tile);
    expect(container.querySelectorAll(".col-labels .on, .row-labels .on")).toHaveLength(0);
  });

  it("highlight for the keyboard focus too", () => {
    const { container } = render(<BoardView title="Board" board={board} onCellClick={() => undefined} />);
    act(() => screen.getByLabelText("Row 0, column 1: green, locked").focus());
    expect(container.querySelector(".col-labels .on")?.textContent).toBe("1");
    expect(container.querySelector(".row-labels .on")?.textContent).toBe("0");
  });
});

describe("inset variant", () => {
  it("is the same board with an inset class", () => {
    const { container } = render(<BoardView title="Target" board={board} variant="inset" testId="board-target" />);
    expect(screen.getByTestId("board-target")).toHaveClass("board-panel", "board-inset");
    expect(container.querySelectorAll(".cell")).toHaveLength(4);
  });
});
