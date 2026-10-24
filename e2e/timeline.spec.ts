import { expect, test, type Locator, type Page } from "@playwright/test";
import { boardCodes, lineClasses, openLevel, replaceEditor, start, statusText, typeProof } from "./support.js";

type Box = { x: number; y: number; width: number; height: number };

const centre = async (locator: Locator): Promise<{ x: number; y: number }> => {
  const b = (await locator.boundingBox()) as Box;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

const node = (page: Page, index: number): Locator => page.locator(`[data-testid=timeline] .node[data-index='${index}']`);

for (const theme of ["dark", "light"] as const) {
  test.describe(`timeline stepper, ${theme} theme`, () => {
    test("has one node per frame and marks where you are", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      await expect(page.locator("[data-testid=timeline] .node")).toHaveCount(3);
      await expect(page.locator("[data-testid=timeline] .node-current")).toHaveAttribute("data-index", "2");
      await expect(page.locator("[data-testid=timeline] .node-done")).toHaveCount(2);
      const slider = page.getByRole("slider", { name: "Proof timeline" });
      await expect(slider).toHaveAttribute("aria-valuenow", "2");
      await expect(slider).toHaveAttribute("aria-valuemax", "2");
    });

    test("clicking a node shows the board after that line", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      await expect.poll(async () => (await boardCodes(page))[1]![0]).toBe("Y.");
      const p = await centre(node(page, 1));
      await page.mouse.click(p.x, p.y);
      await expect.poll(async () => (await boardCodes(page))[1]![0]).toBe("B.");
      await expect(page.locator(".step-label")).toContainText("Line 1");
      await expect(page.locator(".step-count")).toContainText("1 / 2");
    });

    test("dragging along the track scrubs through the proof", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      const from = await centre(node(page, 2));
      const to = await centre(node(page, 0));
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move((from.x + to.x) / 2, from.y, { steps: 4 });
      await page.mouse.move(to.x, to.y, { steps: 4 });
      await page.mouse.up();
      await expect(page.locator(".step-count")).toContainText("0 / 2");
      await expect(page.locator(".step-label")).toContainText("Start");
    });

    test("the arrow keys, Home and End work once the timeline has focus", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      await expect(page.locator(".step-count")).toContainText("2 / 2");
      await page.getByRole("slider", { name: "Proof timeline" }).focus();
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator(".step-count")).toContainText("1 / 2");
      await page.keyboard.press("Home");
      await expect(page.locator(".step-count")).toContainText("0 / 2");
      await page.keyboard.press("End");
      await expect(page.locator(".step-count")).toContainText("2 / 2");
    });

    test("hovering a node highlights its line in the editor and a label names the step", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      const p = await centre(node(page, 1));
      await page.mouse.move(p.x, p.y);
      await expect.poll(async () => (await lineClasses(page))[0]).toContain("cm-hover-line");
      expect((await lineClasses(page))[1]).not.toContain("cm-hover-line");
      await expect(page.locator(".timeline-tip")).toHaveText("Line 1");
      await page.mouse.move(5, 5);
      await expect.poll(async () => (await lineClasses(page))[0]).not.toContain("cm-hover-line");
      await expect(page.locator(".timeline-tip")).toHaveCount(0);
    });

    test("helper steps sit together under their line and the failed one is marked with a cross", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 10);
      await replaceEditor(page, "helpers", ["def ccw (r c : Nat) : List Move := [.rotate (r, c), .rotate (r, 1)]"]);
      await typeProof(page, ["run ccw 0 0"]);
      await expect.poll(() => statusText(page), { timeout: 25_000 }).toContain("Step 2 of helper ccw");
      const group = page.locator("[data-testid=timeline] .node-group");
      await expect(group).toHaveCount(1);
      await expect(group).toHaveAttribute("data-line", "1");
      // The first rotation of the helper ran, then the second was illegal: the reached step is flagged as failed.
      await expect(group.locator(".node-sub")).toHaveCount(1);
      const failed = page.locator("[data-testid=timeline] .node-failed");
      await expect(failed).toHaveCount(1);
      await expect(failed.locator("svg")).toBeVisible();
      await expect(failed).toHaveClass(/node-sub/);
      await expect(failed).toHaveAttribute("data-index", "1");
      await expect(page.locator(".step-label")).toContainText("Line 1, step 1 (failed)");
    });

    test("the transport buttons keep their names and the play button steps forward", async ({ page }) => {
      await start(page, { theme });
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      await page.getByLabel("Jump to start").click();
      await expect(page.locator(".step-count")).toContainText("0 / 2");
      await page.getByLabel("Play").click();
      await expect(page.getByLabel("Pause")).toBeVisible();
      await expect(page.locator(".step-count")).toContainText("2 / 2", { timeout: 6000 });
      await expect(page.getByLabel("Play")).toBeVisible();
    });
  });
}

test("the timeline fits a narrow screen without overflowing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await openLevel(page, 10);
  await typeProof(page, ["run ccw 0 0", "run ccw 1 1", "run ccw 2 2"]);
  await expect(page.locator("[data-testid=timeline] .node")).toHaveCount(10, { timeout: 25_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const track = (await page.getByTestId("timeline").boundingBox()) as Box;
  const last = (await node(page, 9).boundingBox()) as Box;
  expect(last.x + last.width).toBeLessThanOrEqual(track.x + track.width + 1);
});
