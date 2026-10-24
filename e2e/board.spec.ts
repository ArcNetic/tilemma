import { expect, test, type Locator } from "@playwright/test";
import { openLevel, start, typeProof } from "./support.js";

type Box = { x: number; y: number; width: number; height: number };

const box = async (locator: Locator): Promise<Box> => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
};

const style = (locator: Locator, prop: string, pseudo?: string): Promise<string> =>
  locator.evaluate((el, [p, ps]) => getComputedStyle(el, ps || undefined).getPropertyValue(p!), [prop, pseudo ?? ""] as const);

for (const theme of ["dark", "light"] as const) {
  test.describe(`board tiles, ${theme} theme`, () => {
    test("the failing tile keeps its own colour and gets a ring, a chip and no red wash", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)"]);
      const failing = page.locator("[data-testid=board-current] .cell-error");
      await expect(failing).toHaveCount(1, { timeout: 25_000 });
      // (0, 1) is a locked green tile. Compare with an unlocked green tile at (1, 2).
      const plainGreen = page.locator("[data-testid=board-current] .cell[data-row='1'][data-col='2']");
      expect(await style(failing, "background-color")).toBe(await style(plainGreen, "background-color"));
      expect(await style(failing, "box-shadow")).toContain("0px 0px 0px 5px");
      await expect(failing.locator(".cell-flag-error")).toBeVisible();
      expect(await style(failing, "content", "::after")).toBe("none");
    });

    test("a locked tile shows a padlock", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      const lock = page.locator("[data-testid=board-current] .cell-locked .lock");
      await expect(lock).toBeVisible();
      const glyph = await box(lock.locator("rect"));
      expect(glyph.width).toBeGreaterThan(5);
      expect(glyph.height).toBeGreaterThan(5);
    });

    test("a move past the right edge draws a labelled dashed slot outside the board, still inside its panel", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (1, 3)"]);
      const ghost = page.locator("[data-testid=board-current] .ghost");
      await expect(ghost).toHaveCount(1);
      await expect(ghost).toHaveAttribute("aria-label", "(1, 3) is outside the board");
      await expect(ghost).toContainText("(1, 3)");
      const grid = await box(page.locator("[data-testid=board-current] .board-grid"));
      const panel = await box(page.getByTestId("board-current"));
      // The slot shakes once when it appears, so wait until it has settled.
      await expect.poll(async () => (await box(ghost)).x).toBeGreaterThanOrEqual(grid.x + grid.width);
      const slot = await box(ghost);
      expect(slot.x + slot.width).toBeLessThanOrEqual(panel.x + panel.width);
      expect(await style(ghost, "border-top-style")).toBe("dashed");
    });

    test("a move past the bottom edge draws the slot below the board", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (3, 1)"]);
      const ghost = page.locator("[data-testid=board-current] .ghost-bottom");
      await expect(ghost).toHaveCount(1);
      const grid = await box(page.locator("[data-testid=board-current] .board-grid"));
      const panel = await box(page.getByTestId("board-current"));
      const slot = await box(ghost);
      expect(slot.y).toBeGreaterThanOrEqual(grid.y + grid.height);
      expect(slot.y + slot.height).toBeLessThanOrEqual(panel.y + panel.height);
    });

    test("tiles that differ from the target get a ring and a chip, and the error state is different", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      await page.getByLabel("Highlight blocks that differ from the target").check();
      const differing = page.locator("[data-testid=board-current] .cell-mismatch");
      await expect(differing).toHaveCount(2);
      await expect(differing.first().locator(".cell-ring")).toBeVisible();
      await expect(differing.first().locator(".cell-flag-diff")).toBeVisible();
      await expect(page.locator("[data-testid=board-current] .cell-flag-error")).toHaveCount(0);
      expect(await style(differing.first(), "animation-name")).toBe("none");
    });

    test("hovering a tile lifts it, shows its coordinate and lights up its row and column labels", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await start(page, { theme });
      await openLevel(page, 4);
      const tile = page.locator("[data-testid=board-current] .cell[data-row='2'][data-col='1']");
      await tile.hover();
      await expect.poll(() => style(tile, "content", "::after")).toBe('"(2, 1)"');
      await expect.poll(() => style(tile, "translate")).toBe("0px -2px");
      await expect(page.locator("[data-testid=board-current] .col-labels .on")).toHaveText("1");
      await expect(page.locator("[data-testid=board-current] .row-labels .on")).toHaveText("2");
      await page.mouse.move(5, 5);
      await expect(page.locator("[data-testid=board-current] .col-labels .on")).toHaveCount(0);
    });

    test("the black tile has an edge you can see against the tray", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 11);
      const black = page.locator("[data-testid=board-current] .color-K").first();
      const edge = await style(black, "border-top-color");
      const tray = await style(page.locator("[data-testid=board-current] .board-grid"), "background-color");
      expect(edge).not.toBe(tray);
      expect(edge).not.toBe(await style(black, "background-color"));
    });
  });
}

test("tiles scale with the board: patterns and chips stay inside a small thumbnail tile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await openLevel(page, 11);
  const tile = page.locator("[data-testid=board-target] .cell").first();
  const t = await box(tile);
  const letter = await box(tile.locator(".cell-letter"));
  expect(letter.x + letter.width).toBeLessThanOrEqual(t.x + t.width + 1);
  expect(letter.y + letter.height).toBeLessThanOrEqual(t.y + t.height + 1);
});
