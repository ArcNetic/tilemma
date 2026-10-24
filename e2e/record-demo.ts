// Records the submission demo: scripted scenes, a visible cursor, title cards, captured at 1920x1080 through the
// DevTools screencast (sharper than Playwright's built-in recorder). Each scene lasts at least as long as its
// voice-over clip, whose durations come from test-results/demo/voice/durations.json.
//   BASE_URL=https://... pnpm tsx e2e/record-demo.ts
// Output: test-results/demo/frames/*.jpg, frames.json (timestamps) and scenes.json (scene start times).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium, type Locator, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const OUT = "test-results/demo";
const FRAMES = `${OUT}/frames`;
const durationsFile = `${OUT}/voice/durations.json`;
const durations: Record<string, number> = existsSync(durationsFile) ? JSON.parse(readFileSync(durationsFile, "utf8")) : {};

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge" });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
await context.addInitScript(() => {
  localStorage.setItem("tilemma-unlock-all", "1");
  localStorage.setItem("tilemma-onboarding-done", "1");
  localStorage.setItem("tilemma-theme", "light");
});
const page = await context.newPage();

// Screencast capture
const frames: { file: string; t: number }[] = [];
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", (frame) => {
  const file = `${String(frames.length).padStart(6, "0")}.jpg`;
  writeFileSync(`${FRAMES}/${file}`, Buffer.from(frame.data, "base64"));
  frames.push({ file, t: frame.metadata.timestamp ?? Date.now() / 1000 });
  void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
});

const pause = (ms: number) => page.waitForTimeout(ms);

// Scenes: each one starts its voice-over clip and holds until the clip has finished.
const scenes: { id: string; t: number }[] = [];
const scene = async (id: string, run: () => Promise<void>, tail = 500) => {
  const start = Date.now();
  scenes.push({ id, t: start / 1000 });
  await run();
  const rest = (durations[id] ?? 0) * 1000 + tail - (Date.now() - start);
  if (rest > 0) await pause(rest);
};

// Visual aids: a cursor that glides to whatever is clicked, and full-screen title cards.
const installOverlays = (p: Page) =>
  p.evaluate(() => {
    if (document.getElementById("demo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #demo-cursor { position: fixed; z-index: 99999; left: 50%; top: 60%; width: 26px; height: 26px; margin: -4px 0 0 -4px; pointer-events: none;
        transition: left .7s cubic-bezier(.22,1,.36,1), top .7s cubic-bezier(.22,1,.36,1); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
      #demo-cursor.press::after { content: ""; position: absolute; left: -14px; top: -14px; width: 36px; height: 36px; border-radius: 50%;
        border: 3px solid #2563eb; animation: demo-ripple .5s ease-out forwards; }
      @keyframes demo-ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
      #demo-card { position: fixed; inset: 0; z-index: 99998; display: grid; place-items: center; padding: 6vw;
        background: radial-gradient(1200px 600px at 30% 20%, #e8efff 0%, #f7f8fb 55%, #eef1f6 100%); color: #15181d;
        font-family: Inter, "Segoe UI", system-ui, sans-serif; opacity: 0; transition: opacity .6s ease; }
      #demo-card.show { opacity: 1; }
      #demo-card .inner { max-width: 1100px; width: 100%; }
      #demo-card .eyebrow { color: #2563eb; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; font-size: 15px; margin-bottom: 18px; }
      #demo-card h1 { font-size: 76px; line-height: 1.02; margin: 0 0 18px; letter-spacing: -.03em; }
      #demo-card h2 { font-size: 44px; line-height: 1.1; margin: 0 0 26px; letter-spacing: -.02em; }
      #demo-card p { font-size: 24px; color: #454c58; margin: 0 0 12px; line-height: 1.45; }
      #demo-card pre { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 23px; white-space: pre; line-height: 1.6; margin: 0 0 22px;
        padding: 26px 32px; border-radius: 16px; background: #fff; border: 1px solid #d8dce3; box-shadow: 0 12px 32px rgba(16,24,40,.08); }
      #demo-card .k { color: #1d4ed8; font-weight: 600; } #demo-card .t { color: #076a5d; } #demo-card .c { color: #8a919c; }
      #demo-card ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 16px; }
      #demo-card li { font-size: 25px; padding: 18px 24px; border-radius: 14px; background: #fff; border: 1px solid #d8dce3;
        opacity: 0; transform: translateY(10px); animation: demo-in .5s ease forwards; }
      #demo-card li b { color: #1d4ed8; }
      @keyframes demo-in { to { opacity: 1; transform: none } }
      #demo-card .tiles { display: flex; gap: 10px; margin-bottom: 30px; }
      #demo-card .tiles span { width: 54px; height: 54px; border-radius: 11px; box-shadow: inset 0 -5px 0 rgba(0,0,0,.2), 0 4px 0 rgba(0,0,0,.25);
        animation: demo-drop .6s cubic-bezier(.34,1.56,.64,1) both; }
      @keyframes demo-drop { from { transform: translateY(-30px); opacity: 0 } }
    `;
    document.head.append(style);
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.body.append(cursor);
  });

const moveTo = async (target: Locator) => {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) return;
  await page.evaluate(
    ([x, y]) => {
      const c = document.getElementById("demo-cursor")!;
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  await pause(750);
};

const click = async (target: Locator) => {
  await moveTo(target);
  await page.evaluate(() => {
    const c = document.getElementById("demo-cursor")!;
    c.classList.remove("press");
    void c.offsetWidth;
    c.classList.add("press");
  });
  await target.click();
  await pause(300);
};

const showCard = async (html: string) => {
  await page.evaluate((markup) => {
    document.getElementById("demo-card")?.remove();
    const card = document.createElement("div");
    card.id = "demo-card";
    card.innerHTML = `<div class="inner">${markup}</div>`;
    document.body.append(card);
    document.getElementById("demo-cursor")!.style.visibility = "hidden";
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("show")));
  }, html);
  await pause(700);
};

const hideCard = async () => {
  await page.evaluate(() => document.getElementById("demo-card")?.classList.remove("show"));
  await pause(700);
  await page.evaluate(() => {
    document.getElementById("demo-card")?.remove();
    document.getElementById("demo-cursor")!.style.visibility = "visible";
  });
};

const proofEditor = () => page.locator("[data-testid=editor-proof] .cm-content");

const typeProof = async (lines: string[], { clear = true, gap = 650 } = {}) => {
  await click(proofEditor());
  if (clear) {
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
  }
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(line, { delay: 45 });
    await page.keyboard.press("Escape");
    await pause(gap);
  }
};

const openLevel = async (order: number) => {
  await click(page.getByRole("button", { name: "Levels", exact: true }));
  await pause(400);
  await click(page.locator(".level-item", { has: page.locator(`.level-order:text-is("${order}")`) }));
  await page.waitForSelector(`[data-testid=level-info]:has-text("Level ${order}")`);
  await installOverlays(page);
  await pause(500);
};

const closeSuccess = async () => {
  const keep = page.getByRole("button", { name: "Keep looking" });
  await keep.waitFor();
  await click(keep);
};

const tiles = ["#b81f35", "#46b46e", "#1d4ed8", "#f5c518", "#a58bff", "#e8730c"]
  .map((c, i) => `<span style="background:${c};animation-delay:${i * 90}ms"></span>`)
  .join("");

// ---------------------------------------------------------------------------------------------------------------

await page.goto(BASE);
await page.waitForSelector("[data-testid=board-current]");
await installOverlays(page);
await showCard(`<div class="tiles">${tiles}</div><div class="eyebrow">Functional Programming × Lean 4</div><h1>Tilemma</h1>
  <p style="font-size:34px;color:#15181d;font-weight:600;margin-bottom:18px">Slide tiles. Prove it.</p>
  <p>A puzzle game where every solution is a Lean proof, verified by the kernel.</p>`);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await pause(300);

await scene("intro", async () => {
  await pause(Math.max(0, (durations.intro ?? 6) * 1000 - 400));
  await hideCard();
}, 0);

await scene("tour", async () => {
  await moveTo(page.getByTestId("board-current").locator(".board-grid"));
  await pause(1600);
  await moveTo(page.getByTestId("board-target").locator(".board-grid"));
  await pause(1600);
  await moveTo(proofEditor());
});

await scene("first", async () => {
  await typeProof(["swap (0, 0) (0, 1)", "swap (1, 0) (1, 1)"], { gap: 900 });
  await page.waitForSelector("[data-testid=success-overlay]", { timeout: 30_000 });
  await pause(2200);
}, 200);
await closeSuccess();

await openLevel(5);
await scene("error", async () => {
  await typeProof(["swap (0, 0) (0, 2)", "swap (0, 0) (0, 1)"]);
  await page.waitForSelector("[data-testid=status-bar].tone-error", { timeout: 30_000 });
  await moveTo(page.getByTestId("board-current").locator(".cell-error").first());
  await pause(1200);
  await moveTo(page.getByTestId("status-bar"));
});

await scene("fix", async () => {
  await typeProof(["swap (0, 0) (0, 2)", "rotate (1, 1)", "paint (2, 2) green"], { gap: 450 });
  await page.waitForSelector("[data-testid=success-overlay]", { timeout: 30_000 });
  await pause(1800);
}, 200);
await closeSuccess();

await scene("fp", async () => {
  await showCard(`<div class="eyebrow">Under the hood</div><h2>Moves are pure functions. A proof is a fold.</h2>
    <pre><span class="k">def</span> step : <span class="t">Move</span> → <span class="t">Board</span> → <span class="t">Board</span>              <span class="c">-- no state, no side effects</span>
<span class="k">def</span> applyAll : <span class="t">List Move</span> → <span class="t">Board</span> → <span class="t">Option Board</span>  <span class="c">-- a fold of step</span>

<span class="k">inductive</span> <span class="t">Reach</span> (t : <span class="t">Board</span>) : <span class="t">Board</span> → <span class="t">Prop</span>
  | done : <span class="t">Reach</span> t t
  | step : legal m b = true → step m b = b' → <span class="t">Reach</span> t b' → <span class="t">Reach</span> t b</pre>
    <p>Every line you write adds one <b>Reach.step</b>. A cleared level <i>is</i> the proof term.</p>`);
  await pause(Math.max(0, (durations.fp ?? 10) * 1000 - 1200));
  await hideCard();
}, 0);

await openLevel(10);
await scene("helpers", async () => {
  await moveTo(page.locator("[data-testid=editor-helpers] .cm-content"));
  await pause(2600);
  await typeProof(["run ccw 0 0", "run ccw 1 1", "run ccw 2 2"], { gap: 500 });
  await page.waitForSelector("[data-testid=success-overlay]", { timeout: 30_000 });
  await pause(1200);
}, 200);
await closeSuccess();

await scene("timeline", async () => {
  await click(page.getByLabel("Jump to start"));
  for (let i = 0; i < 4; i++) await click(page.getByLabel("Next step"));
  await click(page.getByLabel("Previous step"));
  await click(page.getByLabel("Previous step"));
  await click(page.getByLabel("Jump to end"));
});

await openLevel(12);
await scene("boss", async () => {
  await moveTo(page.locator("[data-testid=editor-helpers] .cm-content"));
  await pause(2400);
  await typeProof(["run diag", "run mirror", "run ccw 0 4", "swap (1, 1) (3, 3)", "paint (2, 2) blue", "paint (4, 0) red"], { gap: 380 });
  await page.waitForSelector("[data-testid=success-overlay]", { timeout: 30_000 });
  await pause(2500);
}, 200);
await closeSuccess();

await scene("lean", async () => {
  await click(page.getByRole("button", { name: "Show Lean" }));
  await page.waitForSelector("[data-testid=lean-panel] .lean-source");
  await pause(1500);
  const source = page.locator("[data-testid=lean-panel] .lean-source");
  await moveTo(source);
  for (let i = 0; i < 6; i++) {
    await source.evaluate((el) => el.scrollBy({ top: 140, behavior: "smooth" }));
    await pause(900);
  }
  await click(page.getByTestId("lean-proved").locator("summary"));
  await pause(400);
  await page.getByTestId("lean-proved").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
});

await scene("engineering", async () => {
  await showCard(`<div class="eyebrow">Built to be trusted</div><h2>The kernel decides. Everything else is checked.</h2><ul>
    <li style="animation-delay:.1s"><b>Property-based tests</b> hold the TypeScript preview to the Lean lemmas</li>
    <li style="animation-delay:.8s"><b>Differential tests</b> compare the preview engine with Lean on every level</li>
    <li style="animation-delay:1.5s"><b>Warm Lean REPL workers</b> verify a proof in about 50 ms</li>
    <li style="animation-delay:2.2s"><b>Hardened sandbox</b>: whitelist sanitizer, fixed template, no <code>sorry</code>, timeouts, rate limits</li></ul>`);
  await pause(Math.max(0, (durations.engineering ?? 8) * 1000 - 700));
}, 0);

await scene("outro", async () => {
  await showCard(`<div class="tiles">${tiles}</div><h1>Tilemma</h1>
    <p style="font-size:34px;color:#15181d;font-weight:600;margin-bottom:22px">Slide tiles. Prove it.</p>
    <p>Play it: <b>${new URL(BASE).host}</b></p>`);
}, 1800);

scenes.push({ id: "end", t: Date.now() / 1000 });
await cdp.send("Page.stopScreencast");
await context.close();
await browser.close();

writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
writeFileSync(`${OUT}/scenes.json`, JSON.stringify(scenes, null, 2));
console.log(`captured ${frames.length} frames, ${scenes.length} scenes`);
