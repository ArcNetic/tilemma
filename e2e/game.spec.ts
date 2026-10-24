import { expect, test } from "@playwright/test";
import { QA_DIR, boardCodes, editor, editorText, lineClasses, openLevel, replaceEditor, start, statusText, typeProof } from "./support.js";

test.describe("core loop", () => {
  test("solve level 1 by typing and see the success screen", async ({ page }) => {
    await start(page);
    expect(await boardCodes(page)).toEqual([["R.", "G."], ["B.", "Y."]]);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await expect.poll(() => boardCodes(page)).toEqual([["G.", "R."], ["B.", "Y."]]);
    await page.screenshot({ path: `${QA_DIR}/20-l1-after-first-line.png` });
    await page.keyboard.press("Enter");
    await page.keyboard.type("swap (1, 0) (1, 1)");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("success-overlay")).toBeVisible();
    await expect(page.getByTestId("verified-badge")).toContainText("Verified by the Lean kernel");
    await expect(page.getByLabel("3 of 3 stars")).toBeVisible();
    await page.screenshot({ path: `${QA_DIR}/21-l1-solved.png` });
    expect(await boardCodes(page)).toEqual(await boardCodes(page, "board-target"));
  });

  test("an illegal move turns the block red, explains why and dims later lines", async ({ page }) => {
    await start(page);
    await openLevel(page, 5);
    await typeProof(page, ["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)", "rotate (1, 1)"]);
    await expect(page.getByTestId("status-bar")).toHaveClass(/tone-error/);
    await expect.poll(() => statusText(page)).toBe("Line 2: Block (0, 1) is locked and cannot be changed.");
    await expect(page.locator("[data-testid=board-current] .cell-error")).toHaveCount(1);
    await expect(page.locator("[data-testid=board-current] .cell-error")).toHaveAttribute("data-row", "0");
    await expect(page.locator("[data-testid=board-current] .cell-error")).toHaveAttribute("data-col", "1");
    await expect.poll(async () => (await lineClasses(page))[2]).toContain("cm-dim-line");
    expect((await lineClasses(page))[0]).not.toContain("cm-dim-line");
    await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Next level" })).toHaveCount(0);
    await page.screenshot({ path: `${QA_DIR}/22-illegal-locked.png` });
  });

  test("the failure is confirmed by Lean with the same message", async ({ page }) => {
    await start(page);
    await openLevel(page, 5);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Verified by Lean", { timeout: 20_000 });
    expect(await statusText(page)).toBe("Line 1: Block (0, 1) is locked and cannot be changed.");
  });

  test("out of bounds shows a red ghost outline instead of a block", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (4, 4)"]);
    await expect(page.locator("[data-testid=board-current] .ghost")).toHaveCount(1);
    expect(await statusText(page)).toContain("(4, 4) is outside the board");
    expect(await boardCodes(page)).toEqual([["R.", "G."], ["B.", "Y."]]);
  });

  test("an incomplete proof counts the blocks that still differ, and highlights them only on request", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("Not there yet");
    await expect(page.locator("[data-testid=board-current] .cell-mismatch")).toHaveCount(0);
    expect(await statusText(page)).toContain("2 blocks still differ");
    await page.getByLabel("Highlight blocks that differ from the target").check();
    await expect(page.locator("[data-testid=board-current] .cell-mismatch")).toHaveCount(2);
  });

  test("a move after the board already matches is called out", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)", "swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await expect.poll(() => statusText(page)).toContain("Line 3: The board already matches the target");
    await expect(page.getByTestId("success-overlay")).toHaveCount(0);
    await expect.poll(async () => (await lineClasses(page))[3]).toContain("cm-dim-line");
    expect((await lineClasses(page))[2]).not.toContain("cm-dim-line");
  });

  test("syntax errors point at the exact spot", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0 1)"]);
    await expect.poll(() => statusText(page)).toContain("Line 1:");
    await expect(page.locator(".cm-lintRange-error")).toHaveCount(1);
  });

  test("moves not unlocked on a level are refused with a clear message", async ({ page }) => {
    await start(page);
    await typeProof(page, ["paint (0, 0) red"]);
    await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("paint move is not available on this level");
  });
});

test.describe("stepper", () => {
  test("stepping back and forward changes the board", async ({ page }) => {
    await start(page);
    await openLevel(page, 4);
    await typeProof(page, ["rotate (0, 0)", "paint (1, 1) blue", "swap (0, 2) (2, 0)"]);
    await expect.poll(async () => (await boardCodes(page))[1]![1]).toBe("B.");
    const finalBoard = await boardCodes(page);
    await page.getByLabel("Previous step").click();
    await expect.poll(async () => (await boardCodes(page))[0]![2]).toBe("B.");
    expect((await boardCodes(page))[1]![1]).toBe("B.");
    await page.getByLabel("Previous step").click();
    await expect.poll(async () => (await boardCodes(page))[1]![1]).toBe("W.");
    await page.getByLabel("Jump to start").click();
    await expect.poll(async () => (await boardCodes(page))[0]![0]).toBe("R^");
    await page.screenshot({ path: `${QA_DIR}/23-stepper-start.png` });
    await page.getByLabel("Jump to end").click();
    await expect.poll(() => boardCodes(page)).toEqual(finalBoard);
  });

  test("Alt+arrow keys step through the proof from inside the editor", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await expect.poll(async () => (await boardCodes(page))[1]![0]).toBe("Y.");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect.poll(async () => (await boardCodes(page))[1]![0]).toBe("B.");
    await page.keyboard.press("Alt+ArrowRight");
    await expect.poll(async () => (await boardCodes(page))[1]![0]).toBe("Y.");
  });

  test("moving the cursor to a line shows the board after that line", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await expect.poll(async () => (await boardCodes(page))[1]![0]).toBe("Y.");
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await boardCodes(page))[1]![0]).toBe("B.");
    await expect(page.locator(".step-label")).toContainText("Line 1");
  });

  test("the stepper highlights the current line in the editor", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await page.getByLabel("Jump to start").click();
    await page.getByLabel("Next step").click();
    await expect.poll(async () => (await lineClasses(page))[0]).toContain("cm-active-frame-line");
  });
});

test.describe("helpers", () => {
  test("a helper level is solved with run and the stepper expands the substeps", async ({ page }) => {
    await start(page);
    await openLevel(page, 10);
    await expect(page.getByTestId("editor-helpers")).toBeVisible();
    await typeProof(page, ["run ccw 0 0", "run ccw 1 1", "run ccw 2 2"]);
    await expect(page.getByTestId("success-overlay")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("verified-badge")).toBeVisible();
    await page.getByRole("button", { name: "Keep looking" }).click();
    await expect(page.locator(".step-count")).toContainText("9 / 9");
    await page.getByLabel("Jump to start").click();
    await page.getByLabel("Next step").click();
    await expect(page.locator(".step-label")).toContainText("Line 1, step 1");
    await page.screenshot({ path: `${QA_DIR}/24-helper-substeps.png` });
  });

  test("an illegal sub-move in a helper reports the step and highlights the run line", async ({ page }) => {
    await start(page);
    await openLevel(page, 10);
    await replaceEditor(page, "helpers", ["def ccw (r c : Nat) : List Move := [.rotate (r, c), .rotate (r, 1)]"]);
    await typeProof(page, ["run ccw 0 0"]);
    await expect.poll(() => statusText(page), { timeout: 25_000 }).toContain("Step 2 of helper ccw");
    await expect(page.locator("[data-testid=board-current] .cell-error")).toHaveCount(1);
    await expect(page.locator("[data-testid=editor-proof] .cm-lintRange-error")).toHaveCount(1);
    await page.screenshot({ path: `${QA_DIR}/25-helper-failure.png` });
  });

  test("a helper that Lean rejects is reported in the helpers pane", async ({ page }) => {
    await start(page);
    await openLevel(page, 8);
    await replaceEditor(page, "helpers", ["def turn : List Move := [.rotate 5]"]);
    await typeProof(page, ["run turn"]);
    await expect.poll(() => statusText(page), { timeout: 25_000 }).toContain("Helpers, line 1:");
    await expect(page.locator("[data-testid=editor-helpers] .cm-lintRange-error")).toHaveCount(1);
  });

  test("forbidden helper syntax never reaches Lean and is explained", async ({ page }) => {
    await start(page);
    await openLevel(page, 8);
    await replaceEditor(page, "helpers", ["def turn : List Move := [.rotate (0, 0)]", "#eval 1"]);
    await typeProof(page, ["run turn"]);
    await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("Helpers, line 2:");
  });
});

test.describe("progress and navigation", () => {
  test("solved levels stay solved after a reload and unlock the next level", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tilemma-onboarding-done", "1"));
    await page.goto("/");
    await page.waitForSelector("[data-testid=board-current]");
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await expect(page.getByTestId("success-overlay")).toBeVisible();
    await page.reload();
    await page.waitForSelector("[data-testid=board-current]");
    await expect(page.getByLabel("3 stars").first()).toBeVisible();
    await page.getByRole("button", { name: "Levels", exact: true }).click();
    await expect(page.getByRole("button", { name: /Fresh Paint/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /Quarter Turn/ })).toBeDisabled();
    await page.screenshot({ path: `${QA_DIR}/26-progress-after-reload.png` });
  });

  test("the next level button loads the next level", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await page.getByRole("button", { name: "Next level" }).click();
    await expect(page.getByTestId("level-info")).toContainText("Level 2");
    expect(await editorText(page)).toBe("");
  });

  test("reset, hint and copy proof work", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await page.getByRole("button", { name: "Hint" }).click();
    await expect(page.getByTestId("hint-box")).toContainText("Swap the two blocks");
    await page.getByRole("button", { name: "Copy proof" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("swap (0, 0) (0, 1)");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => editorText(page)).toBe("");
    expect(await boardCodes(page)).toEqual([["R.", "G."], ["B.", "Y."]]);
  });

  test("clicking a block inserts its coordinates at the cursor", async ({ page }) => {
    await start(page);
    await editor(page).click();
    await page.keyboard.type("swap ");
    await page.keyboard.press("Escape");
    await page.locator("[data-testid=board-target] .cell[data-row='1'][data-col='0']").click();
    await expect.poll(() => editorText(page)).toContain("swap (1, 0)");
  });

  test("Show Lean displays the generated file with the kernel-checked pieces", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Verified by Lean", { timeout: 20_000 });
    await page.getByRole("button", { name: "Show Lean" }).click();
    const panel = page.getByTestId("lean-panel");
    await expect(panel).toContainText("theorem puzzle : Reach");
    await expect(panel).toContainText("swap (0, 0) (0, 1)");
    await expect(panel).toContainText("#print axioms puzzle");
    await page.screenshot({ path: `${QA_DIR}/27-show-lean.png` });
  });

  test("the first level shows onboarding that can be skipped", async ({ page }) => {
    await start(page, { onboarding: true });
    await expect(page.getByTestId("onboarding")).toBeVisible();
    const tour = page.getByTestId("onboarding");
    await tour.getByRole("button", { name: "Next" }).click();
    await tour.getByRole("button", { name: "Next" }).click();
    await tour.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
    await page.reload();
    await page.waitForSelector("[data-testid=board-current]");
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
  });
});

test.describe("robustness", () => {
  test("fast typing never shows a stale verdict", async ({ page }) => {
    await start(page);
    await typeProof(page, ["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"]);
    await expect(page.getByTestId("success-overlay")).toBeVisible();
    await page.getByRole("button", { name: "Keep looking" }).click();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("x", { delay: 5 });
    await expect(page.getByTestId("success-overlay")).toHaveCount(0);
    expect(await statusText(page)).not.toContain("Solved");
    await page.keyboard.press("Backspace");
    await expect(page.getByTestId("success-overlay")).toBeVisible({ timeout: 20_000 });
  });

  test("rapid keystrokes are debounced into few checks", async ({ page }) => {
    await start(page);
    let checks = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/check")) checks++;
    });
    await editor(page).click();
    await page.keyboard.type("swap (0, 0) (0, 1)", { delay: 15 });
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Verified by Lean", { timeout: 20_000 });
    expect(checks).toBeLessThanOrEqual(2);
  });

  test("an unreachable checker shows the offline banner while the preview keeps working", async ({ page }) => {
    await start(page);
    await page.route("**/api/check", (route) => route.abort("connectionrefused"));
    await page.route("**/api/health", (route) => route.abort("connectionrefused"));
    await typeProof(page, ["swap (0, 0) (0, 1)"]);
    await expect(page.getByTestId("offline-banner")).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await boardCodes(page))[0]![0]).toBe("G.");
    await page.unroute("**/api/check");
    await page.unroute("**/api/health");
    await expect(page.getByTestId("offline-banner")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId("board-current").locator(".badge")).toHaveText("Verified by Lean", { timeout: 20_000 });
  });

  test("the app only talks to its own server (works fully offline)", async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL!) && !url.startsWith("data:") && !url.startsWith("blob:")) foreign.push(url);
    });
    await start(page);
    await openLevel(page, 10);
    await typeProof(page, ["run ccw 0 0", "run ccw 1 1", "run ccw 2 2"]);
    await expect(page.getByTestId("success-overlay")).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "Keep looking" }).click();
    await page.getByRole("button", { name: "Show Lean" }).click();
    await expect(page.getByTestId("lean-panel")).toBeVisible();
    expect(foreign).toEqual([]);
  });

  test("the app is usable at 768px and 390px widths", async ({ page }) => {
    await start(page);
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await typeProof(page, ["swap (0, 0) (0, 1)"]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByTestId("board-current")).toBeVisible();
      await expect(editor(page)).toBeVisible();
    }
    await page.screenshot({ path: `${QA_DIR}/28-narrow.png`, fullPage: true });
  });
});
