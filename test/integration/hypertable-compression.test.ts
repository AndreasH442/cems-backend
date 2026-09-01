import { sql } from "kysely";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { getTestDb } from "./support/test-db.js";

interface HypertableRow {
  hypertable_name: string;
  compression_enabled: boolean;
}

interface CompressionJobRow {
  hypertable_name: string;
  config: { compress_after: string };
}

describe("hypertable compression (ADR-011)", () => {
  let db: Db;

  beforeAll(async () => {
    db = await getTestDb();
  });

  it("enables compression on measurements and control_intents", async () => {
    const { rows } = await sql<HypertableRow>`
      SELECT hypertable_name, compression_enabled
      FROM timescaledb_information.hypertables
      WHERE hypertable_name IN ('measurements', 'control_intents')
      ORDER BY hypertable_name
    `.execute(db);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.compression_enabled).toBe(true);
    }
  });

  it("schedules a compress-after-30-days policy for both hypertables, never a retention/drop policy", async () => {
    const { rows } = await sql<CompressionJobRow>`
      SELECT hypertable_name, config
      FROM timescaledb_information.jobs
      WHERE proc_name = 'policy_compression'
        AND hypertable_name IN ('measurements', 'control_intents')
      ORDER BY hypertable_name
    `.execute(db);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.config.compress_after).toBe("30 days");
    }

    const { rows: retentionJobs } = await sql<{ count: string }>`
      SELECT count(*)::text AS count
      FROM timescaledb_information.jobs
      WHERE proc_name = 'policy_retention'
    `.execute(db);
    expect(retentionJobs[0]?.count).toBe("0");
  });
});
