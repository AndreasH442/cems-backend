import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { createDb, type Db } from "../../../src/infrastructure/db/kysely.js";
import { up } from "../../../src/infrastructure/db/migrate.js";

let container: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;
let db: Db | undefined;

/**
 * Starts one shared TimescaleDB container per test process (see package.json
 * test:integration: --poolOptions.forks.singleFork=true) and applies all
 * migrations once. Real Postgres/TimescaleDB, not a mock.
 */
export async function getTestDb(): Promise<Db> {
  if (db) return db;

  container = await new PostgreSqlContainer("timescale/timescaledb:latest-pg16").start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await up(pool);
  db = createDb(pool);
  return db;
}

/** All tenant-scoped tables in FK-safe TRUNCATE order (children first). */
const TABLES_IN_TRUNCATE_ORDER = [
  "verifications",
  "actions",
  "recommendations",
  "case_evidence",
  "case_subjects",
  "case_status_history",
  "anomalies",
  "cases",
  "measurements",
  "control_intents",
  "events",
  "asset_states",
  "vendor_metric_mappings",
  "vendor_object_mappings",
  "measurement_point_meters",
  "asset_measurement_points",
  "connectors",
  "components",
  "measurement_points",
  "assets",
  "sites",
  "organizations",
  "tenants",
] as const;

export async function resetDatabase(): Promise<void> {
  const database = await getTestDb();
  await database.transaction().execute(async (trx) => {
    for (const table of TABLES_IN_TRUNCATE_ORDER) {
      await trx.deleteFrom(table).execute();
    }
  });
}

export async function stopTestDb(): Promise<void> {
  await pool?.end();
  await container?.stop();
  pool = undefined;
  db = undefined;
  container = undefined;
}
