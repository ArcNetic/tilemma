import { loadLevels } from "./levels-io.js";

const BASE = process.env.BASE_URL ?? "http://localhost:8081";
const USERS = Number(process.env.LOAD_USERS ?? 20);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 60);

const levels = loadLevels();
const counts: Record<string, number> = {};
const latencies: number[] = [];
const problems: string[] = [];
let counter = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bump = (key: string) => void (counts[key] = (counts[key] ?? 0) + 1);

const attempt = async (user: number): Promise<void> => {
  const level = levels[(user + counter) % levels.length]!;
  const proofLines = level.reference.proof;
  const broken = counter % 3 === 0 ? [...proofLines.slice(0, -1)] : [...proofLines];
  const proof = `${broken.join("\n")}\n-- user ${user} request ${counter++}`;
  const started = performance.now();
  const reply = await fetch(`${BASE}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ levelId: level.id, helpers: level.reference.helpers, proof }),
  });
  latencies.push(performance.now() - started);
  if (reply.status === 429) {
    bump("BUSY(429)");
    return;
  }
  if (reply.status !== 200) {
    problems.push(`HTTP ${reply.status}`);
    return;
  }
  const body = (await reply.json()) as { status: string };
  bump(body.status);
  if (!["SOLVED", "INCOMPLETE", "ILLEGAL", "EXTRA_MOVES"].includes(body.status)) problems.push(`unexpected status ${body.status} on ${level.id}`);
};

const deadline = performance.now() + SECONDS * 1000;
const run = async (user: number) => {
  while (performance.now() < deadline) {
    try {
      await attempt(user);
    } catch (error) {
      problems.push(`user ${user}: ${(error as Error).message}`);
    }
    await sleep(250 + Math.random() * 600);
  }
};

console.log(`load: ${USERS} users for ${SECONDS}s against ${BASE}`);
await Promise.all(Array.from({ length: USERS }, (_, i) => run(i)));

const sorted = [...latencies].sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!.toFixed(0);
console.log(`requests: ${sorted.length}, p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${sorted[sorted.length - 1]!.toFixed(0)} ms`);
console.log("statuses:", JSON.stringify(counts));
const health = await (await fetch(`${BASE}/api/health`)).json();
console.log("health after load:", JSON.stringify(health));
if (problems.length > 0) {
  console.error(`${problems.length} problems, first: ${problems.slice(0, 5).join(" | ")}`);
  process.exit(1);
}
console.log("load test: no errors other than intentional BUSY");
