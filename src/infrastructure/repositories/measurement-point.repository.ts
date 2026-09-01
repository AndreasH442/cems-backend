import type { Selectable } from "kysely";
import type { MeasurementPoint } from "../../domain/assets/measurement-point.js";
import type { MeasurementPointId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { MeasurementPointsTable } from "../db/schema.js";

function toDomain(row: Selectable<MeasurementPointsTable>): MeasurementPoint {
  return {
    id: row.id as MeasurementPointId,
    tenantId: row.tenant_id as TenantId,
    siteId: row.site_id as SiteId,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertMeasurementPointInput {
  tenantId: TenantId;
  siteId: SiteId;
  name: string;
}

export class MeasurementPointRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertMeasurementPointInput): Promise<MeasurementPoint> {
    const row = await this.db
      .insertInto("measurement_points")
      .values({ tenant_id: input.tenantId, site_id: input.siteId, name: input.name })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: MeasurementPointId): Promise<MeasurementPoint | null> {
    const row = await this.db
      .selectFrom("measurement_points")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findBySite(tenantId: TenantId, siteId: SiteId): Promise<MeasurementPoint[]> {
    const rows = await this.db
      .selectFrom("measurement_points")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("site_id", "=", siteId)
      .execute();
    return rows.map(toDomain);
  }
}
