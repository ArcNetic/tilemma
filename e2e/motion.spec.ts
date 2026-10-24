import { expect, test, type Locator, type Page } from "@playwright/test";
import { openLevel, start, typeProof } from "./support.js";

type Box = { x: number; y: number; width: number; height: number };

const box = async (locator: Locator): Promise<Box> => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box");
  return b;
};

/** Records, with timestamps, the first time each short-lived motion state shows up in the page. */
const watchMotion = (page: Page): Promise<void> =>
  page.addInitScript(() => {
    const w = window as unknown as { __seen: Record<string, number>; __inkAnim?: string };
    w.__seen = {};
    const mark = (key: string, selector: string) => {
      if (!(key in w.__seen) && document.querySelector(selector)) w.__seen[key] = performance.now();
    };
    const check = () => {
      mark("ink", ".cell-ink");
      mark("moving", ".cell-moving");
      mark("stamp", ".badge-stamp");
      mark("flash", ".verify-flash");
      mark("solved", ".board-solved");
      mark("busy", "[aria-busy='true']");
      mark("working", ".badge-working");
      mark("overlay", "[data-testid=success-overlay]");
      const ink = document.querySelector(".cell-ink");
      if (ink) w.__inkAnim = getComputedStyle(ink).animationName;
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true });
  });

const seen = (page: Page): Promise<Record<string, number>> => page.evaluate(() => (window as unknown as { __seen: Record<string, number> }).__seen);

const style = (locator: Locator, prop: string): Promise<string> => locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

const arrowAngle = (locator: Locator): Promise<number> =>
  locator.evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  });

for (const theme of ["dark", "light"] as const) {
  test.describe(`motion, ${theme} theme`, () => {
    test("paint: the old colour is shown shrinking away, then removed", async ({ page }) => {
      await watchMotion(page);
      await start(page, { theme });
      await openLevel(page, 2);
      await typeProof(page, ["paint (0, 0) green"]);
      await expect.poll(async () => "ink" in (await seen(page))).toBe(true);
      expect(await page.evaluate(() => (window as unknown as { __inkAnim?: string }).__inkAnim)).toBe("ink-out");
      await expect(page.locator(".cell-ink")).toHaveCount(0, { timeout: 2000 });
      await expect(page.locator("[data-testid=board-current] .cell[data-row='0'][data-col='0']")).toHaveClass(/color-G/);
    });

    test("paint: stepping back shows the colour change in reverse", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 2);
      await typeProof(page, ["paint (0, 0) green"]);
      await expect(page.locator("[data-testid=board-current] .cell[data-row='0'][data-col='0']")).toHaveClass(/color-G/);
      await expect(page.locator(".cell-ink")).toHaveCount(0, { timeout: 2000 });
      await page.getByLabel("Jump to start").click();
      await expect(page.locator("[data-testid=board-current] .cell[data-row='0'][data-col='0']")).toHaveClass(/color-R/);
      // The old green was shown leaving: the ink layer existed for a moment and is gone again.
      await expect(page.locator(".cell-ink")).toHaveCount(0, { timeout: 2000 });
    });

    test("swap: a travelling tile is lifted, and every tile ends in its own slot with none overlapping", async ({ page }) => {
      await watchMotion(page);
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)"]);
      await expect.poll(async () => "moving" in (await seen(page))).toBe(true);
      await expect(page.locator(".cell-moving")).toHaveCount(0, { timeout: 2000 });
      await expect(page.locator("[data-testid=board-current] .cell-error")).toHaveCount(1, { timeout: 25_000 });
      await page.waitForTimeout(900);
      const cells = page.locator("[data-testid=board-current] .cell");
      const slots = page.locator("[data-testid=board-current] .slot");
      const n = await cells.count();
      expect(n).toBe(9);
      const cellBoxes: Box[] = [];
      for (let i = 0; i < n; i++) cellBoxes.push(await box(cells.nth(i)));
      const slotBoxes: Box[] = [];
      for (let i = 0; i < n; i++) slotBoxes.push(await box(slots.nth(i)));
      for (const c of cellBoxes) {
        const home = slotBoxes.find((s) => Math.abs(s.x - c.x) <= 1.5 && Math.abs(s.y - c.y) <= 1.5);
        expect(home, "every tile sits exactly on a slot").toBeDefined();
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = cellBoxes[i]!;
          const b = cellBoxes[j]!;
          const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          expect(overlapX > 2 && overlapY > 2, `tiles ${i} and ${j} must not overlap`).toBe(false);
        }
      }
    });

    test("rotate: the arrow settles a quarter turn further round", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      const arrow = page.locator("[data-testid=board-current] .cell[data-row='1'][data-col='1'] .arrow");
      await page.waitForTimeout(600);
      const before = await arrowAngle(arrow);
      await typeProof(page, ["rotate (1, 1)"]);
      await page.waitForTimeout(1200);
      const after = await arrowAngle(arrow);
      const turn = (((after - before) % 360) + 360) % 360;
      expect(Math.abs(turn - 90)).toBeLessThan(1.5);
    });

    test("Lean checking shows a busy indicator and a spinner on the badge", async ({ page }) => {
      await watchMotion(page);
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      await expect.poll(async () => "busy" in (await seen(page))).toBe(true);
      expect("working" in (await seen(page))).toBe(true);
      await expect(page.getByRole("toolbar", { name: "Level actions" }).getByRole("status")).not.toHaveAttribute("aria-busy", "true", { timeout: 25_000 });
    });

    test("verified: the badge is stamped and a clean board glows green for a moment", async ({ page }) => {
      await watchMotion(page);
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Verified by Lean", { timeout: 25_000 });
      await expect.poll(async () => Object.keys(await seen(page)).filter((k) => k === "stamp" || k === "flash").sort()).toEqual(["flash", "stamp"]);
      await expect(page.locator(".badge-stamp")).toHaveCount(0, { timeout: 3000 });
      await expect(page.locator(".verify-flash")).toHaveCount(0);
      await expect(page.getByTestId("board-current").locator(".badge-verified svg")).toBeVisible();
    });

    test("verified: a failed proof still gets a stamped badge but no green glow", async ({ page }) => {
      await watchMotion(page);
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Verified by Lean", { timeout: 25_000 });
      await expect.poll(async () => "stamp" in (await seen(page))).toBe(true);
      await page.waitForTimeout(1200);
      expect("flash" in (await seen(page))).toBe(false);
    });

    test("an error clears softly and the banner slides in", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      const bar = page.getByTestId("status-bar");
      await expect(bar).toHaveClass(/tone-error/, { timeout: 25_000 });
      expect(await style(bar, "animation-name")).toBe("banner-in");
      expect(await style(page.locator("[data-testid=board-current] .cell").first(), "transition-duration")).toContain("0.22s");
    });

    test("solved: the tiles pulse in a wave, the board keeps a green edge, then the dialog arrives with confetti", async ({ page }) => {
      await watchMotion(page);
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      await expect(page.getByTestId("success-overlay")).toBeVisible({ timeout: 25_000 });
      const times = await seen(page);
      expect(times.overlay! - times.solved!).toBeGreaterThanOrEqual(700);
      expect(times.overlay! - times.solved!).toBeLessThan(2500);
      const tiles = page.locator("[data-testid=board-current] .cell");
      expect(await style(tiles.first(), "animation-name")).toBe("cell-wave");
      const delays = await tiles.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDelay));
      expect(new Set(delays).size).toBe(3); // 2x2 board: waves 0, 1 and 2
      // Confetti: block colours from the tokens, never in the way of clicks.
      const confetti = page.locator(".confetti");
      expect(await style(confetti, "pointer-events")).toBe("none");
      await expect(confetti.locator(".piece")).toHaveCount(56);
      const red = await style(confetti.locator(".piece.color-R").first(), "background-color");
      const tokenRed = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--block-R)";
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      });
      expect(red).toBe(tokenRed);
      // The card is calm: the verified line fits on at most two lines.
      expect((await box(page.getByTestId("verified-badge"))).height).toBeLessThan(80);
      await page.getByRole("button", { name: "Keep looking" }).click();
      await expect(page.getByTestId("board-current")).toHaveClass(/board-solved/);
      expect(await style(page.locator("[data-testid=board-current] .board-grid"), "border-top-color")).not.toBe("");
    });
  });
}

test.describe("reduced motion", () => {
  test.use({ colorScheme: "dark" });

  test("nothing moves: no ink, no lift, no stamp, no wave, no confetti, and the dialog appears at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await watchMotion(page);
    await start(page);
    await openLevel(page, 2);
    await typeProof(page, ["paint (0, 0) green", "paint (1, 1) yellow"]);
    await expect(page.getByTestId("success-overlay")).toBeVisible({ timeout: 25_000 });
    const times = await seen(page);
    expect("ink" in times).toBe(false);
    expect("stamp" in times).toBe(false);
    expect("moving" in times).toBe(false);
    expect(times.overlay! - times.solved!).toBeLessThan(400);
    expect(await style(page.locator(".confetti"), "display")).toBe("none");
    expect(await style(page.locator("[data-testid=board-current] .cell").first(), "animation-name")).toBe("none");
    await page.getByRole("button", { name: "Keep looking" }).click();
    await expect(page.getByTestId("board-current")).toHaveClass(/board-solved/);
    expect(await style(page.locator("[data-testid=board-current] .board-grid"), "box-shadow")).toContain("0px 0px 0px 2px");
  });

  test("a swap and an error are shown without movement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await watchMotion(page);
    await start(page);
    await openLevel(page, 5);
    await typeProof(page, ["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)"]);
    await expect(page.locator("[data-testid=board-current] .cell-error")).toHaveCount(1, { timeout: 25_000 });
    expect("moving" in (await seen(page))).toBe(false);
    expect(parseFloat(await style(page.locator("[data-testid=board-current] .cell-error"), "animation-duration"))).toBeLessThan(0.001);
  });
});
