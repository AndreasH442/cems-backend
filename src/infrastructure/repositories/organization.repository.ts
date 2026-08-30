import type { Selectable } from "kysely";
import type { Organization } from "../../domain/tenancy/organization.js";
import type { OrganizationId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { OrganizationsTable } from "../db/schema.js";

function toDomain(row: Selectable<OrganizationsTable>): Organization {
  return {
    id: row.id as OrganizationId,
    tenantId: row.tenant_id as TenantId,
    name: row.name,
    parentOrganizationId: (row.parent_organization_id as OrganizationId | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertOrganizationInput {
  tenantId: TenantId;
  name: string;
  parentOrganizationId?: OrganizationId;
}

export class OrganizationRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertOrganizationInput): Promise<Organization> {
    const row = await this.db
      .insertInto("organizations")
      .values({
        tenant_id: input.tenantId,
        name: input.name,
        parent_organization_id: input.parentOrganizationId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: OrganizationId): Promise<Organization | null> {
    const row = await this.db
      .selectFrom("organizations")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
