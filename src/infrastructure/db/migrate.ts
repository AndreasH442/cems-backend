import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import { createPool } from "./client.js";

const MIGRATIONS_DIR = path.dirname(fileURLToPath(import.meta.url)) + "/migrations";

async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function listUpMigrations(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith(".up.sql")).sort((a, b) => a.localeCompare(b));
}

async function appliedMigrations(client: PoolClient): Promise<Set<string>> {
  const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
  return new Set(rows.map((r) => r.name));
}

export async function up(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await ensureMigrationsTable(client);
    const already = await appliedMigrations(client);
    const upFiles = await listUpMigrations();
    for (const file of upFiles) {
      const name = file.replace(/\.up\.sql$/, "");
      if (already.has(name)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        applied.push(name);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    client.release();
  }
  return applied;
}

export async function down(pool: Pool, steps = 1): Promise<string[]> {
  const client = await pool.connect();
  const reverted: string[] = [];
  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT $1",
      [steps],
    );
    for (const { name } of rows) {
      const downFile = path.join(MIGRATIONS_DIR, `${name}.down.sql`);
      const sql = await readFile(downFile, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("DELETE FROM schema_migrations WHERE name = $1", [name]);
        await client.query("COMMIT");
        reverted.push(name);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Rollback of ${name} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    client.release();
  }
  return reverted;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const pool = createPool();
  try {
    if (command === "up") {
      const applied = await up(pool);
      console.log(applied.length > 0 ? `Applied: ${applied.join(", ")}` : "Nothing to apply.");
    } else if (command === "down") {
      const steps = process.argv[3] ? Number(process.argv[3]) : 1;
      const reverted = await down(pool, steps);
      console.log(reverted.length > 0 ? `Reverted: ${reverted.join(", ")}` : "Nothing to revert.");
    } else {
      console.error("Usage: migrate.ts <up|down> [steps]");
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
