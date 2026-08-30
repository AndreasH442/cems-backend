import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration tests share one Testcontainers-managed TimescaleDB per process
    // (test/integration/support/test-db.ts) — must run in a single fork, not parallel workers.
    pool: "forks",
    singleFork: true,
  },
});
