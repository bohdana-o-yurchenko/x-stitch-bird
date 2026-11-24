import { defineConfig } from "@playwright/test";

/**
 * Drawing speed in a real browser with the CPU slowed down (docs/ARCHITECTURE-REVIEW.md §1). Runs against a server
 * already started on PERF_URL (default: the e2e port), e.g. `pnpm build && pnpm start --port 3200`, then
 * `pnpm test:perf`. Not part of `pnpm test` or the e2e run: timings depend on the machine.
 */
export default defineConfig({
  testDir: "tests/perf",
  testMatch: "*.perf.ts",
  timeout: 180_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PERF_URL ?? "http://localhost:3200",
    channel: "chrome",
    viewport: { width: 1600, height: 900 },
  },
});
