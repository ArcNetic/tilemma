import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openLevel, start, typeProof, useTheme } from "./support.js";

type Box = { x: number; y: number; width: number; height: number };

const box = async (locator: Locator): Promise<Box> => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
};

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (inner: Box, outer: Box, slack = 1): boolean =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;

const scan = async (page: Page): Promise<string[]> => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
};

const activeIn = (page: Page, selector: string): Promise<boolean> => page.evaluate((s) => !!document.activeElement?.closest(s), selector);

/** A first-time player: nothing unlocked, onboarding not yet seen. */
const freshStart = async (page: Page, theme: "dark" | "light", onboardingDone = true): Promise<void> => {
  await useTheme(page, theme);
  if (onboardingDone) await page.addInitScript(() => localStorage.setItem("tilemma-onboarding-done", "1"));
  await page.goto("/");
  await page.waitForSelector("[data-testid=board-current]");
};

for (const theme of ["dark", "light"] as const) {
  test.describe(`app chrome, ${theme} theme`, () => {
    test("the level list shows locked levels with a lock and keeps focus inside while open", async ({ page }) => {
      await freshStart(page, theme);
      const levelsButton = page.getByRole("button", { name: "Levels", exact: true });
      await levelsButton.click();
      const drawer = page.getByTestId("level-drawer");
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(/0 of 12 solved/)).toBeVisible();
      await expect(drawer.locator(".level-item.locked")).toHaveCount(11);
      await expect(drawer.locator(".level-item.locked").first()).toBeDisabled();
      await expect(drawer.locator(".level-item.locked").first().locator("[aria-label='Locked']")).toBeVisible();
      await expect(drawer.locator(".level-item[aria-current='true']")).toContainText("First Swap");
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-current"))).toBe("true");
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        expect(await activeIn(page, "[data-testid=level-drawer]")).toBe(true);
      }
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Shift+Tab");
        expect(await activeIn(page, "[data-testid=level-drawer]")).toBe(true);
      }
      expect(await scan(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.locator(".drawer.open")).toHaveCount(0);
      await expect(levelsButton).toBeFocused();
    });

    test("a solved level shows a check, its best score and counts in the summary", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      await expect(page.getByTestId("success-overlay")).toBeVisible({ timeout: 25_000 });
      await page.getByRole("button", { name: "Keep looking" }).click();
      await page.getByRole("button", { name: "Levels", exact: true }).click();
      const first = page.locator(".level-item.solved").first();
      await expect(first).toContainText("Best: 2");
      await expect(first.locator("[aria-label='Solved']")).toBeVisible();
      await expect(page.getByTestId("level-drawer").getByText(/1 of 12 solved/)).toBeVisible();
    });

    test("Show Lean is a dialog with a highlighted file that traps focus, copies, and gives focus back", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Verified by Lean", { timeout: 25_000 });
      const opener = page.getByRole("button", { name: "Show Lean" });
      await opener.click();
      const panel = page.getByRole("dialog", { name: "Generated Lean file" });
      await expect(panel).toBeVisible();
      await expect(page.getByRole("button", { name: "Close the Lean panel" })).toBeFocused();
      await expect(panel.locator(".tok-keyword", { hasText: "theorem" }).first()).toBeVisible();
      await expect(panel.locator(".lean-line").first()).toBeVisible();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(await activeIn(page, "[data-testid=lean-panel]")).toBe(true);
      }
      expect(await scan(page)).toEqual([]);
      await panel.getByRole("button", { name: /Copy file/ }).click();
      await expect(panel.getByRole("button", { name: /Copied/ })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("theorem puzzle");
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test("the success dialog traps focus and gives it back on Escape", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      const overlay = page.getByTestId("success-overlay");
      await expect(overlay).toBeVisible({ timeout: 25_000 });
      await expect(page.getByRole("button", { name: "Next level" })).toBeFocused();
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Tab");
        expect(await activeIn(page, "[data-testid=success-overlay]")).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(overlay).toHaveCount(0);
      expect(await activeIn(page, "[data-testid=success-overlay]")).toBe(false);
    });

    test("system notices float over the page, so the layout does not move", async ({ page }) => {
      await start(page, { theme });
      const before = await box(page.locator(".workspace"));
      await page.route("**/api/check", (route) => route.abort("connectionrefused"));
      await page.route("**/api/health", (route) => route.abort("connectionrefused"));
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      const banner = page.getByTestId("offline-banner");
      await expect(banner).toBeVisible({ timeout: 10_000 });
      const after = await box(page.locator(".workspace"));
      expect(after).toEqual(before);
      expect(await banner.evaluate((el) => getComputedStyle(el.parentElement!).position)).toBe("fixed");
      expect(await scan(page)).toEqual([]);
    });

    test("when the levels cannot load, a full-page message offers another try", async ({ page }) => {
      await useTheme(page, theme);
      await page.route("**/api/levels", (route) => route.abort("connectionrefused"));
      await page.goto("/");
      const error = page.getByTestId("load-error");
      await expect(error).toBeVisible();
      await expect(error.getByRole("heading", { name: "Could not load the levels" })).toBeVisible();
      expect(await scan(page)).toEqual([]);
      await page.unroute("**/api/levels");
      await error.getByRole("button", { name: "Try again" }).click();
      await page.waitForSelector("[data-testid=board-current]");
      await expect(page.getByTestId("level-info")).toContainText("Level 1");
    });

    test("the coach marks point at the board, the editor and the banner", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await freshStart(page, theme, false);
      const tour = page.getByTestId("onboarding");
      const ring = page.locator(".coach-ring");
      const viewport = { x: 0, y: 0, width: 1280, height: 800 };
      await expect(tour).toBeVisible();
      await expect(tour.getByRole("button", { name: "Next" })).toBeFocused();

      // 1: the board. The card sits below it and does not cover it.
      await expect(ring).toBeVisible();
      const board = await box(page.getByTestId("board-current"));
      await expect.poll(async () => inside(board, await box(ring), 8)).toBe(true);
      expect(inside(await box(tour), viewport)).toBe(true);
      expect(overlaps(await box(tour), board)).toBe(false);
      expect(await scan(page)).toEqual([]);

      // 2: the editor. The card sits inside the proof pane, below the first lines.
      await tour.getByRole("button", { name: "Next" }).click();
      await expect(tour).toContainText("2. Write one move per line");
      const pane = await box(page.locator(".pane-proof"));
      await expect.poll(async () => inside(pane, await box(ring), 8)).toBe(true);
      expect(inside(await box(tour), pane)).toBe(true);
      expect(await scan(page)).toEqual([]);

      // 3: the banner. The card sits beside it, on screen.
      await tour.getByRole("button", { name: "Next" }).click();
      await expect(tour).toContainText("3. Lean checks every line");
      const banner = await box(page.getByTestId("status-bar"));
      await expect.poll(async () => inside(banner, await box(ring), 8)).toBe(true);
      expect(inside(await box(tour), viewport)).toBe(true);
      expect(overlaps(await box(tour), banner)).toBe(false);
      await tour.getByRole("button", { name: "Got it" }).click();
      await expect(tour).toHaveCount(0);
      await expect(ring).toHaveCount(0);
    });

    test("Escape skips the tour, it stays gone after a reload, and the help button brings it back on any level", async ({ page }) => {
      await freshStart(page, theme, false);
      await expect(page.getByTestId("onboarding")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("onboarding")).toHaveCount(0);
      await page.reload();
      await page.waitForSelector("[data-testid=board-current]");
      await expect(page.getByTestId("onboarding")).toHaveCount(0);
      await page.evaluate(() => localStorage.setItem("tilemma-unlock-all", "1"));
      await page.reload();
      await page.waitForSelector("[data-testid=board-current]");
      await openLevel(page, 3);
      await page.getByRole("button", { name: "How to play" }).click();
      await expect(page.getByTestId("onboarding")).toBeVisible();
      await page.getByRole("button", { name: "Skip" }).click();
      await expect(page.getByTestId("onboarding")).toHaveCount(0);
    });
  });
}

test("the coach marks stay on screen at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await freshStart(page, "dark", false);
  const tour = page.getByTestId("onboarding");
  await expect(tour).toBeVisible();
  for (const label of ["Next", "Next", "Got it"]) {
    const t = await box(tour);
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width).toBeLessThanOrEqual(390);
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.y + t.height).toBeLessThanOrEqual(844);
    await tour.getByRole("button", { name: label }).click();
  }
  await expect(tour).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
