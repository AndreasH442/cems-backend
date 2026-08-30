import type { Selectable } from "kysely";
import type { Measurement, MeasurementQuality } from "../../domain/timeseries/measurement.js";
import type { AssetId, ConnectorId, MeasurementId, MetricDefinitionId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { MeasurementsTable } from "../db/schema.js";

function toDomain(row: Selectable<MeasurementsTable>): Measurement {
  return {
    id: row.id as MeasurementId,
    tenantId: row.tenant_id as TenantId,
    assetId: row.asset_id as AssetId,
    metricDefinitionId: row.metric_definition_id as MetricDefinitionId,
    timestamp: row.timestamp,
    value: row.value,
    quality: row.quality as MeasurementQuality,
    connectorId: (row.connector_id as ConnectorId | null) ?? null,
    vendorObjectId: row.vendor_object_id,
    vendorSensorId: row.vendor_sensor_id,
  };
}

export interface UpsertMeasurementInput {
  tenantId: TenantId;
  assetId: AssetId;
  metricDefinitionId: MetricDefinitionId;
  timestamp: Date;
  value: number;
  quality: MeasurementQuality;
  /** Vendor provenance — required together to dedupe on re-ingest (last-write-wins). */
  connectorId?: ConnectorId;
  vendorObjectId?: string;
  vendorSensorId?: string;
}

export class MeasurementRepository {
  constructor(private readonly db: Db) {}

  /**
   * Upserts on the (tenant_id, connector_id, vendor_object_id, vendor_sensor_id, timestamp)
   * natural key (docs/data-model.md). Rows without vendor provenance (connectorId undefined,
   * e.g. quality=CALCULATED) are always inserted as new rows — there is no dedup key for them.
   */
  async upsert(input: UpsertMeasurementInput): Promise<Measurement> {
    const values = {
      tenant_id: input.tenantId,
      asset_id: input.assetId,
      metric_definition_id: input.metricDefinitionId,
      timestamp: input.timestamp,
      value: input.value,
      quality: input.quality,
      connector_id: input.connectorId ?? null,
      vendor_object_id: input.vendorObjectId ?? null,
      vendor_sensor_id: input.vendorSensorId ?? null,
    };

    if (!input.connectorId) {
      const row = await this.db.insertInto("measurements").values(values).returningAll().executeTakeFirstOrThrow();
      return toDomain(row);
    }

    const row = await this.db
      .insertInto("measurements")
      .values(values)
      .onConflict((oc) =>
        oc
          .columns(["tenant_id", "connector_id", "vendor_object_id", "vendor_sensor_id", "timestamp"])
          .where("connector_id", "is not", null)
          .doUpdateSet({ value: (eb) => eb.ref("excluded.value"), quality: (eb) => eb.ref("excluded.quality") }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  /** Used by the auditor rules (application/auditor/rules.ts) to find the reading closest after a setpoint, or to check whether one exists at all in a window. */
  async findEarliestInWindow(
    tenantId: TenantId,
    assetId: AssetId,
    metricDefinitionId: MetricDefinitionId,
    from: Date,
    to: Date,
  ): Promise<Measurement | null> {
    const row = await this.db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("asset_id", "=", assetId)
      .where("metric_definition_id", "=", metricDefinitionId)
      .where("timestamp", ">=", from)
      .where("timestamp", "<=", to)
      .orderBy("timestamp", "asc")
      .limit(1)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findById(tenantId: TenantId, id: MeasurementId, timestamp: Date): Promise<Measurement | null> {
    const row = await this.db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .where("timestamp", "=", timestamp)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
