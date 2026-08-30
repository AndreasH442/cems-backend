import type { Selectable } from "kysely";
import type {
  AssetMeasurementPoint,
  AssetMeasurementPointRelationType,
} from "../../domain/assets/asset-measurement-point.js";
import type { AssetId, AssetMeasurementPointId, MeasurementPointId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { AssetMeasurementPointsTable } from "../db/schema.js";

function toDomain(row: Selectable<AssetMeasurementPointsTable>): AssetMeasurementPoint {
  return {
    id: row.id as AssetMeasurementPointId,
    tenantId: row.tenant_id as TenantId,
    assetId: row.asset_id as AssetId,
    measurementPointId: row.measurement_point_id as MeasurementPointId,
    relationType: row.relation_type as AssetMeasurementPointRelationType,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  };
}

export interface InsertAssetMeasurementPointInput {
  tenantId: TenantId;
  assetId: AssetId;
  measurementPointId: MeasurementPointId;
  relationType: AssetMeasurementPointRelationType;
  validFrom: Date;
  validUntil?: Date;
}

export class AssetMeasurementPointRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertAssetMeasurementPointInput): Promise<AssetMeasurementPoint> {
    const row = await this.db
      .insertInto("asset_measurement_points")
      .values({
        tenant_id: input.tenantId,
        asset_id: input.assetId,
        measurement_point_id: input.measurementPointId,
        relation_type: input.relationType,
        valid_from: input.validFrom,
        valid_until: input.validUntil ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
