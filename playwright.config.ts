import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT ?? 8080);

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env.PW_CHANNEL ?? "msedge",
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm -F @pp/server start",
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { PORT: String(port) },
  },
});
