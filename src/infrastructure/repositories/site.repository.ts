import type { Selectable } from "kysely";
import type { Site } from "../../domain/tenancy/site.js";
import type { OrganizationId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { SitesTable } from "../db/schema.js";

function toDomain(row: Selectable<SitesTable>): Site {
  return {
    id: row.id as SiteId,
    tenantId: row.tenant_id as TenantId,
    organizationId: row.organization_id as OrganizationId,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertSiteInput {
  tenantId: TenantId;
  organizationId: OrganizationId;
  name: string;
}

export class SiteRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertSiteInput): Promise<Site> {
    const row = await this.db
      .insertInto("sites")
      .values({ tenant_id: input.tenantId, organization_id: input.organizationId, name: input.name })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: SiteId): Promise<Site | null> {
    const row = await this.db
      .selectFrom("sites")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
