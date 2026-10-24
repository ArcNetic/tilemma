import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The design tokens are the single source of the look, so their contrast is tested from the file itself:
 * text meets WCAG AA, every tile can be told from its tray, and no two block colours merge
 * for players with colour-vision deficiency (patterns and letters back the colours up as well).
 */

// Vitest runs from the web package, and jsdom gives import.meta.url a non-file scheme.
const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

const blocks = [...css.matchAll(/(:root(?:\[data-theme="light"\])?) \{([\s\S]*?)\n\}/g)].map((m) => ({ selector: m[1]!, body: m[2]! }));
const parse = (body: string): Record<string, string> => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
const dark = parse(blocks.find((b) => b.selector === ":root" && b.body.includes("--surface-0"))!.body);
const light = { ...dark, ...parse(blocks.find((b) => b.selector.includes("light"))!.body) };
const themes = { dark, light } as const;

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const lin = (c: number): number => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (c: Rgb): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const mixWith = (a: Rgb, b: Rgb, share: number): Rgb => a.map((v, i) => v * share + b[i]! * (1 - share)) as Rgb;

const TEXT_PAIRS: [string, string, string][] = [
  ["text-1", "surface-2", "text on panes"],
  ["text-2", "surface-2", "secondary text on panes"],
  ["text-3", "surface-2", "tertiary text on panes"],
  ["text-3", "surface-3", "tertiary text on raised surfaces"],
  ["text-2", "surface-4", "secondary text on dialogs"],
  ["accent-fg", "surface-2", "accent on panes"],
  ["accent-on", "accent-fill", "button text on the accent fill"],
  ["state-success-fg", "surface-2", "success on panes"],
  ["state-error-fg", "surface-2", "error on panes"],
  ["state-warning-fg", "surface-2", "warning on panes"],
  ["state-info-fg", "surface-2", "info on panes"],
  ["state-error-on", "state-error-solid", "glyph on the error chip"],
  ["state-warning-on", "state-warning-solid", "glyph on the warning chip"],
  ["syntax-keyword", "editor-bg", "keyword in the editor"],
  ["syntax-color", "editor-bg", "colour name in the editor"],
  ["syntax-number", "editor-bg", "number in the editor"],
  ["syntax-type", "editor-bg", "type name in the editor"],
  ["syntax-comment", "editor-bg", "comment in the editor"],
];

describe.each(Object.entries(themes))("%s theme", (_name, t) => {
  it.each(TEXT_PAIRS)("%s on %s meets WCAG AA (4.5:1): %s", (fg, bg) => {
    expect(contrast(hex(t[fg]!), hex(t[bg]!))).toBeGreaterThanOrEqual(4.5);
  });

  it("makes every tile distinguishable from the tray (3:1 for its fill or its edge)", () => {
    const tray = hex(t["tray"]!);
    for (const k of ["R", "G", "B", "Y", "P", "O", "W", "K"]) {
      const fill = hex(t[`block-${k}`]!);
      // These mirror the --edge rules in board.css.
      const edge = k === "K" ? hex(t["block-K-edge"]!) : mixWith(fill, [0, 0, 0], k === "W" ? 0.42 : 0.58);
      expect(Math.max(contrast(fill, tray), contrast(edge, tray)), `tile ${k}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the colour letter readable on every tile", () => {
    const [r, g, b, a] = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(t["tag-bg"]!)!.slice(1).map(Number) as [number, number, number, number];
    for (const k of ["R", "G", "B", "Y", "P", "O", "W", "K"]) {
      const chip = mixWith([r, g, b], hex(t[`block-${k}`]!), a);
      expect(contrast([255, 255, 255], chip), `letter on ${k}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// Colour-vision-deficiency simulation (Machado et al. 2009, full severity) and CIE76 colour difference.
const MATRICES = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
} as const;
const gamma = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const simulate = (h: string, mode: keyof typeof MATRICES): Rgb => {
  const l = hex(h).map(lin) as Rgb;
  return MATRICES[mode].map((row) => gamma(Math.min(1, Math.max(0, row[0]! * l[0] + row[1]! * l[1] + row[2]! * l[2]))) * 255) as Rgb;
};
const toLab = (rgb: Rgb): Rgb => {
  const [R, G, B] = rgb.map(lin) as Rgb;
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (v: number): number => (v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const distance = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe.each(Object.entries(themes))("block colours for colour-vision deficiency, %s theme", (_name, t) => {
  const keys = ["R", "G", "B", "Y", "P", "O", "W", "K"];
  it.each(["normal", "protan", "deutan", "tritan"] as const)("every pair stays apart for %s vision (colour difference of at least 15)", (mode) => {
    const colour = (k: string): Rgb => (mode === "normal" ? hex(t[`block-${k}`]!) : simulate(t[`block-${k}`]!, mode));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        expect(distance(toLab(colour(keys[i]!)), toLab(colour(keys[j]!))), `${keys[i]} and ${keys[j]}`).toBeGreaterThanOrEqual(15);
      }
    }
  });
});
