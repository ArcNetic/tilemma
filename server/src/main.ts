import { createRuntime, prewarm } from "./runtime.js";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

const runtime = await createRuntime({ logger: process.env.LOG === "1" });
const warmMs = await prewarm(runtime);
await runtime.app.listen({ port, host });
console.log(`Tilemma listening on http://${host}:${port} (prewarm ${warmMs} ms, ${runtime.runner.kind} runner)`);

const shutdown = async () => {
  await runtime.app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
