import { Pool, type PoolConfig } from "pg";

export function createPool(config?: PoolConfig): Pool {
  const connectionString = config?.connectionString ?? process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set and no connectionString was provided");
  }
  return new Pool({ connectionString, ...config });
}
