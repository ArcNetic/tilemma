import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openLevel, start, typeProof } from "./support.js";

const scan = async (page: Page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
};

for (const theme of ["dark", "light"] as const) {
test.describe(`accessibility (axe-core), ${theme} theme`, () => {
  test("initial level", async ({ page }) => {
    await start(page, { theme });
    expect(await scan(page)).toEqual([]);
  });

  test("onboarding card", async ({ page }) => {
    await start(page, { onboarding: true, theme });
    await expect(page.getByTestId("onboarding")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test("failure state with a red block and a squiggle", async ({ page }) => {
    await start(page, { theme });
    await openLevel(page, 5);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await expect(page.locator("[data-testid=board-current] .cell-error")).toHaveCount(1);
    expect(await scan(page)).toEqual([]);
  });

  test("helper level with two editors", async ({ page }) => {
    await start(page, { theme });
    await openLevel(page, 10);
    await expect(page.getByTestId("editor-helpers")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test("level drawer open", async ({ page }) => {
    await start(page, { theme });
    await page.getByRole("button", { name: "Levels", exact: true }).click();
    await expect(page.getByTestId("level-drawer")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test("success dialog", async ({ page }) => {
    await start(page, { theme });
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await expect(page.getByTestId("success-overlay")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });

  test("Show Lean panel and an incomplete proof", async ({ page }) => {
    await start(page, { theme });
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await page.getByRole("button", { name: "Show Lean" }).click();
    await expect(page.getByTestId("lean-panel")).toBeVisible();
    expect(await scan(page)).toEqual([]);
  });
});
}
