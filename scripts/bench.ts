import { createRuntime } from "../server/src/runtime.js";

const SEQUENTIAL = 50;
const CONCURRENT = 10;

const percentile = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;

const summarize = (label: string, samples: number[]): void => {
  const sorted = [...samples].sort((a, b) => a - b);
  console.log(
    `${label}: n=${sorted.length} p50=${percentile(sorted, 0.5).toFixed(0)}ms p95=${percentile(sorted, 0.95).toFixed(0)}ms max=${sorted[sorted.length - 1]!.toFixed(0)}ms`,
  );
};

const runtime = await createRuntime({ concurrency: Math.min(CONCURRENT, 8), checksPerMinute: 1_000_000 });
const level = runtime.catalog.byId("L04")!;
const base = level.reference.proof.join("\n");
let counter = 0;

const timedCheck = async (): Promise<number> => {
  const started = performance.now();
  const outcome = await runtime.checker.check({ levelId: level.id, helpers: "", proof: `${base}\n-- run ${counter++}` });
  const elapsed = performance.now() - started;
  if (outcome.kind !== "response" || outcome.response.status !== "SOLVED") throw new Error("benchmark proof was not solved");
  return elapsed;
};

await timedCheck();

const sequential: number[] = [];
for (let i = 0; i < SEQUENTIAL; i++) sequential.push(await timedCheck());

const wall = performance.now();
const concurrent = await Promise.all(Array.from({ length: CONCURRENT }, timedCheck));
const wallMs = performance.now() - wall;

summarize("sequential", sequential);
summarize("concurrent", concurrent);
console.log(`concurrent wall clock for ${CONCURRENT} checks: ${wallMs.toFixed(0)}ms (pool size ${Math.min(CONCURRENT, 8)})`);

await runtime.app.close();
