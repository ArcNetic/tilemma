import { existsSync } from "node:fs";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { toPublicLevel, toSummary } from "@pp/engine";
import Fastify, { type FastifyInstance } from "fastify";
import type { Checker } from "./check.js";
import { CheckRequestSchema } from "./diagnostics.js";
import type { LevelCatalog } from "./levels.js";
import type { LeanRunner } from "./runner.js";

export type AppOptions = {
  catalog: LevelCatalog;
  checker: Checker;
  runner: LeanRunner;
  webDist?: string;
  checksPerMinute: number;
  logger?: boolean;
};

export const buildApp = async (options: AppOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    bodyLimit: 32 * 1024,
    logger: options.logger ?? false,
    // Behind a reverse proxy the rate limit must key on the client address from X-Forwarded-For.
    trustProxy: process.env.TRUST_PROXY === "1",
  });

  await app.register(rateLimit, { global: false });
  app.addHook("onClose", async () => options.runner.shutdown?.());

  app.get("/api/health", async () => ({
    lean: await options.runner.version(),
    runner: options.runner.kind,
    warm: options.runner.isWarm(),
  }));

  app.get("/api/levels", async () => options.catalog.all.map(toSummary));

  app.get<{ Params: { id: string } }>("/api/levels/:id", async (request, reply) => {
    const level = options.catalog.byId(request.params.id);
    if (!level) return reply.code(404).send({ error: "Unknown level" });
    return toPublicLevel(level);
  });

  app.post(
    "/api/check",
    { config: { rateLimit: { max: options.checksPerMinute, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = CheckRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.issues });
      const outcome = await options.checker.check(parsed.data);
      if (outcome.kind === "unknown-level") return reply.code(404).send({ error: "Unknown level" });
      return reply.code(outcome.response.status === "BUSY" ? 429 : 200).send(outcome.response);
    },
  );

  if (options.webDist && existsSync(options.webDist)) {
    await app.register(fastifyStatic, { root: options.webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
};
