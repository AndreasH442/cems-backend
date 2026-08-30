import type { Selectable } from "kysely";
import type { Tenant, TenantStatus } from "../../domain/tenancy/tenant.js";
import type { TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { TenantsTable } from "../db/schema.js";

function toDomain(row: Selectable<TenantsTable>): Tenant {
  return {
    id: row.id as TenantId,
    name: row.name,
    status: row.status as TenantStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertTenantInput {
  name: string;
  status?: TenantStatus;
}

export class TenantRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertTenantInput): Promise<Tenant> {
    const row = await this.db
      .insertInto("tenants")
      .values({ name: input.name, ...(input.status ? { status: input.status } : {}) })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(id: TenantId): Promise<Tenant | null> {
    const row = await this.db.selectFrom("tenants").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
