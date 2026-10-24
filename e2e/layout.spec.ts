import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { editor, openLevel, start, typeProof } from "./support.js";

type Box = { x: number; y: number; width: number; height: number };

const box = async (locator: Locator): Promise<Box> => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
};

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const pageOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const pageScroll = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

test.describe("workspace layout", () => {
  test("at 1280x800 the board and the editor sit side by side and the page does not scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    const ed = await box(page.getByTestId("editor-proof"));
    const board = await box(page.getByTestId("board-current"));
    expect(board.x + board.width).toBeLessThanOrEqual(ed.x);
    expect(await pageScroll(page)).toBeLessThanOrEqual(0);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("the failure banner is directly below the editor and names the problem", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await openLevel(page, 5);
    await typeProof(page, ["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)"]);
    const bar = page.getByTestId("status-bar");
    await expect(bar).toHaveClass(/tone-error/, { timeout: 25_000 });
    await expect(bar.locator(".status-heading")).toHaveText("Proof failed");
    await expect(bar.locator(".status-text")).toContainText("locked");
    const barBox = await box(bar);
    const edBox = await box(page.getByTestId("editor-proof"));
    expect(edBox.y + edBox.height).toBeLessThanOrEqual(barBox.y);
    expect(Math.abs(barBox.x - edBox.x)).toBeLessThan(20);
  });

  test("the action toolbar is above the editor and Ctrl+Enter does not add a line", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    const tools = await box(page.getByRole("toolbar", { name: "Level actions" }));
    const ed = await box(page.getByTestId("editor-proof"));
    expect(tools.y + tools.height).toBeLessThanOrEqual(ed.y);
    await editor(page).click();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("[data-testid=editor-proof] .cm-line")).toHaveCount(1);
  });

  for (const [width, height] of [
    [1280, 800],
    [1100, 800],
    [900, 800],
    [768, 900],
    [390, 844],
  ] as const) {
    for (const [order, name] of [
      [1, "2x2"],
      [5, "3x3"],
      [11, "5x5"],
    ] as const) {
      test(`the target never covers the current board (${name} at ${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await start(page);
        if (order !== 1) await openLevel(page, order);
        const current = await box(page.getByTestId("board-current"));
        const target = await box(page.getByTestId("board-target"));
        expect(overlaps(current, target)).toBe(false);
        expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
        // The board may scroll inside a very short stage, but it may never spill over the controls.
        const scrolls = await page.locator(".stage-board").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
        const stepper = await box(page.getByRole("group", { name: "Step through the proof" }));
        if (!scrolls) expect(current.y + current.height).toBeLessThanOrEqual(stepper.y + 1);
      });
    }
  }

  // No shipped level is bigger than 5x5, so a stand-in 6x6 level is served to check the largest size the game allows.
  for (const [width, height] of [
    [1280, 800],
    [1100, 800],
    [900, 800],
    [768, 900],
    [390, 844],
  ] as const) {
    test(`a 6x6 board fits the stage and the target stays clear of it (${width}px)`, async ({ page }) => {
      await page.route("**/api/levels/L04", async (route) => {
        const level = (await (await route.fetch()).json()) as { start: string[][]; target: string[][] };
        const codes = ["R.", "G.", "B.", "Y.", "W.", "K."];
        const grid = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => codes[(r + c) % codes.length]!));
        level.start = grid;
        level.target = grid.map((row) => [...row].reverse());
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(level) });
      });
      await page.setViewportSize({ width, height });
      await start(page);
      await openLevel(page, 4);
      await expect(page.locator("[data-testid=board-current] .cell")).toHaveCount(36);
      const current = await box(page.getByTestId("board-current"));
      const target = await box(page.getByTestId("board-target"));
      expect(overlaps(current, target)).toBe(false);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
      if (width >= 900) {
        // Side by side, the whole board is visible without scrolling inside the stage.
        const scrolls = await page.locator(".stage-board").evaluate((el) => el.scrollHeight > el.clientHeight + 1);
        expect(scrolls).toBe(false);
        const stage = await box(page.locator(".stage"));
        expect(current.y + current.height).toBeLessThanOrEqual(stage.y + stage.height);
      }
      const stepper = await box(page.getByRole("group", { name: "Step through the proof" }));
      expect(current.y + current.height).toBeLessThanOrEqual(stepper.y + 1);
    });
  }

  test("a 6x6 board still clears the target when the divider is pushed to give the stage its least room", async ({ page }) => {
    await page.route("**/api/levels/L04", async (route) => {
      const level = (await (await route.fetch()).json()) as { start: string[][]; target: string[][] };
      const codes = ["R.", "G.", "B.", "Y.", "W.", "K."];
      const grid = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => codes[(r + c) % codes.length]!));
      level.start = grid;
      level.target = grid.map((row) => [...row].reverse());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(level) });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await openLevel(page, 4);
    const bar = page.getByTestId("splitter-stage");
    await bar.focus();
    await page.keyboard.press("Home");
    const stage = await box(page.locator(".stage"));
    expect(stage.width).toBeLessThan(500);
    const current = await box(page.getByTestId("board-current"));
    const target = await box(page.getByTestId("board-target"));
    expect(overlaps(current, target)).toBe(false);
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
  });

  for (const width of [768, 390]) {
    test(`when stacked (${width}px) the editors keep their intended height and an empty level can be clicked into`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await start(page);
      const proof = await box(page.getByTestId("editor-proof"));
      expect(proof.height).toBeGreaterThanOrEqual(215);
      // The Try it chip sits at the bottom of the empty editor and must not cover its middle.
      await editor(page).click({ timeout: 3000 });
      await page.keyboard.type("swap (0, 0) (0, 1)");
      await expect(page.locator("[data-testid=editor-proof] .cm-line")).toHaveCount(1);
      await openLevel(page, 10);
      expect((await box(page.getByTestId("editor-helpers"))).height).toBeGreaterThanOrEqual(145);
      expect((await box(page.getByTestId("editor-proof"))).height).toBeGreaterThanOrEqual(215);
    });
  }

  test("at 390px the editor is reachable without scrolling past two boards", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page);
    await openLevel(page, 5);
    const ed = await box(page.getByTestId("editor-proof"));
    const current = await box(page.getByTestId("board-current"));
    const target = await box(page.getByTestId("board-target"));
    expect(target.height).toBeLessThan(current.height * 0.7);
    expect(ed.y).toBeLessThan(1400);
  });
});

test.describe("resizable panes", () => {
  test("the editor splitter moves with the keyboard, keeps its minimum and is remembered", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    const bar = page.getByTestId("splitter-stage");
    await expect(bar).toHaveAttribute("aria-valuenow", "58");
    const before = await box(page.getByTestId("editor-proof"));
    await bar.focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(bar).toHaveAttribute("aria-valuenow", "48");
    const wider = await box(page.getByTestId("editor-proof"));
    expect(wider.width).toBeGreaterThan(before.width + 80);
    await page.keyboard.press("End");
    const narrow = await box(page.getByTestId("editor-proof"));
    expect(narrow.width + 16).toBeGreaterThanOrEqual(318);
    await page.keyboard.press("Shift+ArrowLeft");
    await page.reload();
    await expect(page.getByTestId("splitter-stage")).not.toHaveAttribute("aria-valuenow", "58");
    await page.getByTestId("splitter-stage").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("splitter-stage")).toHaveAttribute("aria-valuenow", "58");
  });

  test("dragging the splitter with the mouse resizes the editor", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    const before = await box(page.getByTestId("editor-proof"));
    const handle = await box(page.getByTestId("splitter-stage"));
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 160, handle.y + handle.height / 2, { steps: 8 });
    await page.mouse.up();
    const after = await box(page.getByTestId("editor-proof"));
    expect(after.width).toBeGreaterThan(before.width + 100);
    await expect(page.getByTestId("board-current")).toBeVisible();
    expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("on helper levels Helpers sits above Proof and the divider between them resizes both", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await openLevel(page, 10);
    const helpers = page.getByTestId("editor-helpers");
    const proof = page.getByTestId("editor-proof");
    const h0 = await box(helpers);
    const p0 = await box(proof);
    expect(h0.y + h0.height).toBeLessThanOrEqual(p0.y);
    const bar = page.getByTestId("splitter-editors");
    await bar.focus();
    await page.keyboard.press("Shift+ArrowDown");
    const h1 = await box(helpers);
    const p1 = await box(proof);
    expect(h1.height).toBeGreaterThan(h0.height + 20);
    expect(p1.height).toBeLessThan(p0.height - 20);
    await page.keyboard.press("End");
    // The editor body (without its header) keeps room for at least three lines.
    expect((await box(proof)).height).toBeGreaterThanOrEqual(63);
    await page.keyboard.press("Home");
    expect((await box(helpers)).height).toBeGreaterThanOrEqual(63);
  });

  test("the dividers are gone when the layout stacks", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await start(page);
    await expect(page.getByTestId("splitter-stage")).toBeHidden();
  });
});

test.describe("layout accessibility", () => {
  test("a tall proof that overflows its editor is still keyboard reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await typeProof(page, Array.from({ length: 40 }, (_, i) => `swap (0, ${i % 2}) (1, ${i % 2})`));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
