import { FORBIDDEN_HELPER_BODIES, FORBIDDEN_PAYLOADS } from "../server/test/payloads.js";

const BASE = process.env.BASE_URL ?? "http://localhost:8081";

type Response = { status: string; leanMs: number; generatedLean?: string; diagnostics: { code: string }[] };

const post = async (levelId: string, helpers: string, proof: string): Promise<Response> => {
  const reply = await fetch(`${BASE}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ levelId, helpers, proof }),
  });
  if (reply.status !== 200) throw new Error(`HTTP ${reply.status}`);
  return (await reply.json()) as Response;
};

const failures: string[] = [];
let checked = 0;

const expectRejectedBeforeLean = (label: string, response: Response): void => {
  checked++;
  const rejected = response.status === "FORBIDDEN" || response.status === "SYNTAX_ERROR";
  const neverReachedLean = response.leanMs === 0 && response.generatedLean === undefined;
  if (!rejected || !neverReachedLean) failures.push(`${label}: status=${response.status} leanMs=${response.leanMs} generated=${response.generatedLean !== undefined}`);
};

for (const [name, payload] of FORBIDDEN_PAYLOADS) {
  expectRejectedBeforeLean(`proof ${name}`, await post("L10", "", payload));
  expectRejectedBeforeLean(`proof after valid line ${name}`, await post("L10", "", `rotate (0, 0)\n${payload}`));
}

for (const body of FORBIDDEN_HELPER_BODIES) {
  expectRejectedBeforeLean(`helper ${JSON.stringify(body).slice(0, 50)}`, await post("L10", body, "run x"));
}

const extras: [string, string, string, string][] = [
  ["null byte", "L01", "", "swap (0, 0) (0, 1)\u0000"],
  ["bidi override in comment", "L01", "", `-- ${String.fromCodePoint(0x202e)} hi\nswap (0, 0) (0, 1)`],
  ["cyrillic homoglyph", "L01", "", `sw${String.fromCodePoint(0x430)}p (0, 0) (0, 1)`],
  ["tab", "L01", "", "swap\t(0, 0) (0, 1)"],
  ["huge number", "L01", "", "swap (0, 0) (0, 99999999999999999999999)"],
  ["helper on helper-free level", "L01", "def a : List Move := []", "swap (0, 0) (0, 1)"],
];
for (const [name, level, helpers, proof] of extras) expectRejectedBeforeLean(name, await post(level, helpers, proof));

const valid = await post("L01", "", "swap (0, 0) (0, 1)\nswap (1, 0) (1, 1)");
if (valid.status !== "SOLVED") failures.push(`sanity: valid proof returned ${valid.status}`);

console.log(`checked ${checked} hostile inputs against ${BASE}`);
if (failures.length > 0) {
  console.error(`${failures.length} failures:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log("all hostile inputs were rejected before reaching Lean; a valid proof still solves");
