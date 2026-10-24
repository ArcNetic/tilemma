import { expect, test } from "@playwright/test";
import { editor, editorText, lineClasses, openLevel, start, typeProof } from "./support.js";

for (const theme of ["dark", "light"] as const) {
  test.describe(`editor, ${theme} theme`, () => {
    test("the failing line is marked in the gutter and on the line, and later lines are dimmed but readable", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)", "rotate (1, 1)"]);
      await expect(page.locator(".cm-lintRange-error")).toHaveCount(1, { timeout: 25_000 });
      await expect.poll(async () => (await lineClasses(page))[1]).toContain("cm-fail-line");
      const classes = await lineClasses(page);
      expect(classes[1]).not.toContain("cm-dim-line");
      expect(classes[2]).toContain("cm-dim-line");
      const marked = page.locator("[data-testid=editor-proof] .cm-gutterElement.cm-fail-gutter");
      await expect(marked).toHaveCount(1);
      await expect(marked).toHaveText("2");
      const opacity = await page.locator("[data-testid=editor-proof] .cm-dim-line").first().evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(opacity).toBeGreaterThanOrEqual(0.5);
    });

    test("a rate limit is reported in the banner and does not mark the player's first line as a mistake", async ({ page }) => {
      await start(page, { theme });
      await page.route("**/api/check", (route) => route.fulfill({ status: 429, contentType: "application/json", body: "{}" }));
      await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
      await expect(page.getByTestId("status-bar")).toHaveClass(/tone-warning/, { timeout: 10_000 });
      await expect(page.getByTestId("status-bar")).toContainText("Too many checks");
      await expect(page.locator(".cm-lintRange-error")).toHaveCount(0);
      await expect(page.locator(".cm-fail-gutter")).toHaveCount(0);
      await expect(page.locator(".pane-count")).toHaveCount(0);
      expect((await lineClasses(page)).some((c) => c.includes("cm-dim-line"))).toBe(false);
      // No answer came back from Lean, so nothing is verified.
      await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Preview");
    });

    test("errors are underlined with a wavy line in the error colour", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 5);
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      const squiggle = page.locator(".cm-lintRange-error").first();
      await expect(squiggle).toBeVisible({ timeout: 25_000 });
      const decoration = await squiggle.evaluate((el) => getComputedStyle(el).textDecorationLine + " " + getComputedStyle(el).textDecorationStyle);
      expect(decoration).toBe("underline wavy");
      expect(await squiggle.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
    });

    test("colour names get a small swatch that does not change the text", async ({ page }) => {
      await start(page, { theme });
      await openLevel(page, 2);
      await typeProof(page, ["paint (0, 0) red", "-- paint (0, 1) green"]);
      await expect(page.locator("[data-testid=editor-proof] .cm-swatch.color-R")).toHaveCount(1);
      await expect(page.locator("[data-testid=editor-proof] .cm-swatch")).toHaveCount(1);
      await expect.poll(() => editorText(page)).toBe("paint (0, 0) red\n-- paint (0, 1) green");
    });

    test("an empty first level offers a try-it chip that inserts the example", async ({ page }) => {
      await start(page, { theme });
      const chip = page.getByRole("button", { name: /Try it/ });
      await expect(chip).toBeVisible();
      await chip.click();
      await expect.poll(() => editorText(page)).toBe("swap (0, 0) (0, 1)");
      await expect(chip).toHaveCount(0);
      await openLevel(page, 2);
      await expect(page.getByRole("button", { name: /Try it/ })).toHaveCount(0);
    });

    test("the autocomplete popup follows the theme", async ({ page }) => {
      await start(page, { theme });
      await editor(page).click();
      await page.keyboard.type("sw");
      const popup = page.locator(".cm-tooltip-autocomplete");
      await expect(popup).toBeVisible();
      const bg = await popup.evaluate((el) => getComputedStyle(el).backgroundColor);
      const surface = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--surface-4)";
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      });
      expect(bg).toBe(surface);
    });
  });
}
