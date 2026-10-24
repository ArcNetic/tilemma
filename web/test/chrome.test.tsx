import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBanner, Notice, OfflineBanner } from "../src/components/Banners.js";
import { Header } from "../src/components/Header.js";
import { LevelDrawer } from "../src/components/LevelDrawer.js";
import { Onboarding } from "../src/components/Onboarding.js";
import { ShowLeanPanel } from "../src/components/ShowLeanPanel.js";
import { useDialogFocus } from "../src/hooks/useDialogFocus.js";
import { highlightLean } from "../src/lib/leanHighlight.js";

afterEach(() => vi.restoreAllMocks());

describe("Notice", () => {
  it("is an alert with a tone and an optional action", async () => {
    const onClick = vi.fn();
    render(
      <Notice tone="error" testId="n" action={{ label: "Retry", onClick }}>
        Something broke
      </Notice>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("notice", "notice-error");
    expect(alert).toHaveTextContent("Something broke");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("OfflineBanner and ErrorBanner use it and render nothing when there is nothing to say", () => {
    const { rerender, container } = render(<OfflineBanner visible />);
    expect(screen.getByTestId("offline-banner")).toHaveClass("notice-warning");
    rerender(<OfflineBanner visible={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ErrorBanner message="Levels failed to load" onRetry={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveClass("notice-error");
    rerender(<ErrorBanner message={null} onRetry={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const Dialog = ({ onClose }: { onClose: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(open, ref, () => {
    setOpen(false);
    onClose();
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Outside</button>
      {open && (
        <div ref={ref} tabIndex={-1} role="dialog" aria-label="Test dialog">
          <button type="button">First</button>
          <button type="button" data-autofocus="">
            Middle
          </button>
          <button type="button">Last</button>
        </div>
      )}
    </>
  );
};

describe("useDialogFocus", () => {
  it("moves focus in, keeps Tab inside, closes on Escape and gives focus back", async () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    expect(screen.getByRole("button", { name: "Middle" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();
  });
});

describe("Header", () => {
  const level = { id: "L01", order: 1, title: "First Swap", concept: "swap", par: 2, intro: "", hint: "", helpers: "none" as const };

  it("has a help button that replays the tour", async () => {
    const onHelp = vi.fn();
    render(createElement(Header, { level: level as never, stars: 2, best: 3, onOpenLevels: () => undefined, onHelp }));
    await userEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(onHelp).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("2 stars")).toBeInTheDocument();
    expect(screen.getByText("Your best: 3 lines")).toBeInTheDocument();
  });
});

describe("LevelDrawer states", () => {
  const levels = [
    { id: "L01", order: 1, title: "First", concept: "swap", par: 2, helpers: "none" as const },
    { id: "L02", order: 2, title: "Second", concept: "paint", par: 2, helpers: "none" as const },
    { id: "L03", order: 3, title: "Third", concept: "rotate", par: 3, helpers: "none" as const },
  ];
  const props = { levels, currentId: "L02", unlockAll: false, onToggleUnlockAll: () => undefined, onSelect: () => undefined, onClose: () => undefined };

  it("shows solved, current and locked levels in more than colour", () => {
    render(<LevelDrawer open {...props} progress={{ L01: { best: 2, stars: 3 } }} />);
    const first = screen.getByRole("button", { name: /First/ });
    const second = screen.getByRole("button", { name: /Second/ });
    const third = screen.getByRole("button", { name: /Third/ });
    expect(first).toHaveClass("solved");
    expect(first).toHaveTextContent("Best: 2");
    expect(first.querySelector("[aria-label='Solved']")).not.toBeNull();
    expect(second).toHaveAttribute("aria-current", "true");
    expect(third).toBeDisabled();
    expect(third).toHaveClass("locked");
    expect(third.querySelector("[aria-label='Locked']")).not.toBeNull();
    expect(third).toHaveTextContent("Locked");
  });

  it("keeps the level number as the order badge text", () => {
    const { container } = render(<LevelDrawer open {...props} progress={{}} />);
    expect(Array.from(container.querySelectorAll(".level-order")).map((n) => n.textContent)).toEqual(["1", "2", "3"]);
  });

  it("summarises progress", () => {
    render(<LevelDrawer open {...props} progress={{ L01: { best: 2, stars: 3 }, L02: { best: 4, stars: 1 } }} />);
    expect(screen.getByText(/2 of 3 solved/)).toBeInTheDocument();
    expect(screen.getByText(/4 stars in total/)).toBeInTheDocument();
  });

  it("moves focus to the current level on open and returns it on close", async () => {
    const Wrapper = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Levels
          </button>
          <LevelDrawer open={open} {...props} progress={{ L01: { best: 2, stars: 3 } }} onClose={() => setOpen(false)} />
        </>
      );
    };
    render(<Wrapper />);
    const opener = screen.getByRole("button", { name: "Levels" });
    await userEvent.click(opener);
    expect(screen.getByRole("button", { name: /Second/ })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });
});

describe("ShowLeanPanel", () => {
  const source = `import ProofPuzzle\n-- the puzzle\ntheorem puzzle : Reach t b := by\n  swap (0, 0) (0, 1)\n  rfl\n#print axioms puzzle\n`;

  it("is a labelled dialog with a numbered, highlighted source", () => {
    const { container } = render(<ShowLeanPanel source={source} open onClose={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "Generated Lean file" })).toBeInTheDocument();
    expect(container.querySelectorAll(".lean-line")).toHaveLength(6);
    expect(container.querySelector(".tok-comment")?.textContent).toBe("-- the puzzle");
    expect(Array.from(container.querySelectorAll(".tok-keyword")).map((n) => n.textContent)).toContain("theorem");
    expect(Array.from(container.querySelectorAll(".tok-tactic")).map((n) => n.textContent)).toEqual(expect.arrayContaining(["swap", "rfl"]));
    expect(screen.getByTestId("lean-panel")).toHaveTextContent("theorem puzzle : Reach");
    expect(screen.getByTestId("lean-panel")).toHaveTextContent("#print axioms puzzle");
  });

  it("tells you to run a proof when there is no file yet and has nothing to copy", () => {
    render(<ShowLeanPanel source={undefined} open onClose={() => undefined} />);
    expect(screen.getByText("Run a proof to see the file Lean checked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy file/ })).toBeDisabled();
  });

  it("copies the file and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShowLeanPanel source={source} open onClose={() => undefined} />);
    await act(async () => screen.getByRole("button", { name: /Copy file/ }).click());
    expect(writeText).toHaveBeenCalledWith(source);
    expect(screen.getByRole("button", { name: /Copied/ })).toBeInTheDocument();
  });

  it("closes on Escape and from the close button, and renders nothing when closed", async () => {
    const onClose = vi.fn();
    const { rerender, container } = render(<ShowLeanPanel source={source} open onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close the Lean panel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<ShowLeanPanel source={source} open={false} onClose={onClose} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("highlightLean", () => {
  it("returns one element per line without a trailing blank", () => {
    expect(highlightLean("a\nb\n")).toHaveLength(2);
    expect(highlightLean("")).toHaveLength(1);
  });
});

describe("Onboarding coach marks", () => {
  it("walks through three steps and finishes with Got it", async () => {
    const onDone = vi.fn();
    render(<Onboarding onDone={onDone} />);
    const tour = screen.getByTestId("onboarding");
    expect(tour).toHaveTextContent("1. Read the boards");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(tour).toHaveTextContent("2. Write one move per line");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(tour).toHaveTextContent("3. Lean checks every line");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("can be skipped with the button or Escape, and focus starts on the main button", async () => {
    const onDone = vi.fn();
    render(<Onboarding onDone={onDone} />);
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await userEvent.keyboard("{Escape}");
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
