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
    latitude: row.latitude,
    longitude: row.longitude,
    configuration: row.configuration as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertSiteInput {
  tenantId: TenantId;
  organizationId: OrganizationId;
  name: string;
  latitude?: number;
  longitude?: number;
  configuration?: Record<string, unknown>;
}

export interface UpdateSiteLocationInput {
  tenantId: TenantId;
  id: SiteId;
  latitude: number;
  longitude: number;
  configuration?: Record<string, unknown>;
}

export class SiteRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertSiteInput): Promise<Site> {
    const row = await this.db
      .insertInto("sites")
      .values({
        tenant_id: input.tenantId,
        organization_id: input.organizationId,
        name: input.name,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        ...(input.configuration ? { configuration: JSON.stringify(input.configuration) } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  /** Master-data maintenance (ADR-012) — onboarding scripts today, a future management UI/API later. */
  async updateLocation(input: UpdateSiteLocationInput): Promise<Site> {
    const row = await this.db
      .updateTable("sites")
      .set({
        latitude: input.latitude,
        longitude: input.longitude,
        ...(input.configuration ? { configuration: JSON.stringify(input.configuration) } : {}),
        updated_at: new Date(),
      })
      .where("tenant_id", "=", input.tenantId)
      .where("id", "=", input.id)
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
