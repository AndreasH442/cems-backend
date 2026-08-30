import type { Selectable } from "kysely";
import type { MeasurementPointMeter } from "../../domain/assets/measurement-point-meter.js";
import type { AssetId, MeasurementPointId, MeasurementPointMeterId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { MeasurementPointMetersTable } from "../db/schema.js";

function toDomain(row: Selectable<MeasurementPointMetersTable>): MeasurementPointMeter {
  return {
    id: row.id as MeasurementPointMeterId,
    tenantId: row.tenant_id as TenantId,
    measurementPointId: row.measurement_point_id as MeasurementPointId,
    meterAssetId: row.meter_asset_id as AssetId,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  };
}

export interface InsertMeasurementPointMeterInput {
  tenantId: TenantId;
  measurementPointId: MeasurementPointId;
  meterAssetId: AssetId;
  validFrom: Date;
  validUntil?: Date;
}

/** Raw insert only — the "meter asset must be of type METER" rule lives in the application-layer linking service, not here. */
export class MeasurementPointMeterRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertMeasurementPointMeterInput): Promise<MeasurementPointMeter> {
    const row = await this.db
      .insertInto("measurement_point_meters")
      .values({
        tenant_id: input.tenantId,
        measurement_point_id: input.measurementPointId,
        meter_asset_id: input.meterAssetId,
        valid_from: input.validFrom,
        valid_until: input.validUntil ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
