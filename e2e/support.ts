import type { Locator, Page } from "@playwright/test";

export const QA_DIR = "test-results/screens";

export const skipOnboarding = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem("tilemma-onboarding-done", "1");
    localStorage.setItem("tilemma-unlock-all", "1");
  });
};

export const useTheme = async (page: Page, theme: "dark" | "light"): Promise<void> => {
  await page.addInitScript((value) => localStorage.setItem("tilemma-theme", value), theme);
};

export const start = async (page: Page, options: { onboarding?: boolean; theme?: "dark" | "light" } = {}): Promise<void> => {
  if (!options.onboarding) await skipOnboarding(page);
  if (options.theme) await useTheme(page, options.theme);
  await page.goto("/");
  await page.waitForSelector("[data-testid=board-current]");
};

export const openLevel = async (page: Page, order: number): Promise<void> => {
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await page.locator(".level-item", { has: page.locator(`.level-order:text-is("${order}")`) }).click();
  await page.waitForSelector(`[data-testid=level-info]:has-text("Level ${order}")`);
};

export const editor = (page: Page, pane: "proof" | "helpers" = "proof"): Locator => page.locator(`[data-testid=editor-${pane}] .cm-content`);

export const replaceEditor = async (page: Page, pane: "proof" | "helpers", lines: string[]): Promise<void> => {
  await editor(page, pane).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line);
    await page.keyboard.press("Escape");
  }
};

export const typeProof = (page: Page, lines: string[]): Promise<void> => replaceEditor(page, "proof", lines);

export const boardCodes = async (page: Page, testId: "board-current" | "board-target" = "board-current"): Promise<string[][]> => {
  const cells = await page.locator(`[data-testid=${testId}] .cell`).evaluateAll((nodes) =>
    nodes.map((n) => ({
      row: Number(n.getAttribute("data-row")),
      col: Number(n.getAttribute("data-col")),
      code: n.getAttribute("data-code") ?? "",
    })),
  );
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  for (const c of cells) grid[c.row]![c.col] = c.code;
  return grid;
};

export const statusText = (page: Page): Promise<string> => page.locator("[data-testid=status-bar] .status-text").innerText();

export const lineClasses = (page: Page, pane: "proof" | "helpers" = "proof"): Promise<string[]> =>
  page.locator(`[data-testid=editor-${pane}] .cm-line`).evaluateAll((nodes) => nodes.map((n) => n.className));

export const editorText = (page: Page, pane: "proof" | "helpers" = "proof"): Promise<string> =>
  page.locator(`[data-testid=editor-${pane}] .cm-line`).evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".cm-placeholder").forEach((p) => p.remove());
        return copy.textContent ?? "";
      })
      .join("\n"),
  );
