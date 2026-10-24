import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const OUT = "test-results/demo-backup.webm";
const TMP = "test-results/demo-video";

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

const openLevel = async (page: Page, order: number) => {
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await pause(page, 500);
  await page.locator(".level-item", { has: page.locator(`.level-order:text-is("${order}")`) }).click();
  await page.waitForSelector(`[data-testid=level-info]:has-text("Level ${order}")`);
  await pause(page, 700);
};

const typeLines = async (page: Page, lines: string[]) => {
  await page.locator("[data-testid=editor-proof] .cm-content").click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line, { delay: 55 });
    await page.keyboard.press("Escape");
    await pause(page, 700);
  }
};

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: TMP, size: { width: 1280, height: 800 } },
});
await context.addInitScript(() => localStorage.setItem("tilemma-unlock-all", "1"));
const page = await context.newPage();

await page.goto(BASE);
await page.waitForSelector("[data-testid=board-current]");
await pause(page, 2500);
const tour = page.getByTestId("onboarding");
if (await tour.isVisible()) {
  for (const label of ["Next", "Next", "Got it"]) {
    await tour.getByRole("button", { name: label }).click();
    await pause(page, 1600);
  }
}

await typeLines(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
await page.waitForSelector("[data-testid=success-overlay]");
await pause(page, 3000);
await page.getByRole("button", { name: "Keep looking" }).click();

await openLevel(page, 5);
await typeLines(page, ["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)", "rotate (1, 1)"]);
await page.waitForSelector("[data-testid=status-bar].tone-error");
await pause(page, 3500);
await typeLines(page, ["swap (0, 0) (0, 2)", "rotate (1, 1)", "paint (2, 2) green"]);
await page.waitForSelector("[data-testid=success-overlay]");
await pause(page, 2500);
await page.getByRole("button", { name: "Keep looking" }).click();

await openLevel(page, 10);
await typeLines(page, ["run ccw 0 0", "run ccw 1 1", "run ccw 2 2"]);
await page.waitForSelector("[data-testid=success-overlay]");
await pause(page, 1500);
await page.getByRole("button", { name: "Keep looking" }).click();
await page.getByLabel("Jump to start").click();
for (let i = 0; i < 9; i++) {
  await page.getByLabel("Next step").click();
  await pause(page, 650);
}

await page.getByRole("button", { name: "Show Lean" }).click();
await pause(page, 4500);

await context.close();
await browser.close();

const video = readdirSync(TMP).find((f) => f.endsWith(".webm"));
if (!video) throw new Error("no video recorded");
copyFileSync(`${TMP}/${video}`, OUT);
console.log("saved", OUT);
