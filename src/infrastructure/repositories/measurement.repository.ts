import type { Selectable } from "kysely";
import type { Measurement, MeasurementQuality } from "../../domain/timeseries/measurement.js";
import type { AssetComponentOrMeasurementPointSubject } from "../../domain/shared/subjects.js";
import type {
  AssetId,
  ComponentId,
  ConnectorId,
  MeasurementId,
  MeasurementPointId,
  MetricDefinitionId,
  TenantId,
} from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { MeasurementsTable } from "../db/schema.js";

function toDomain(row: Selectable<MeasurementsTable>): Measurement {
  const base = {
    id: row.id as MeasurementId,
    tenantId: row.tenant_id as TenantId,
    metricDefinitionId: row.metric_definition_id as MetricDefinitionId,
    timestamp: row.timestamp,
    value: row.value,
    quality: row.quality as MeasurementQuality,
    connectorId: (row.connector_id as ConnectorId | null) ?? null,
    vendorObjectId: row.vendor_object_id,
    vendorSensorId: row.vendor_sensor_id,
  };
  if (row.subject_type === "COMPONENT") {
    return {
      ...base,
      subjectType: "COMPONENT",
      assetId: null,
      componentId: row.component_id as ComponentId,
      measurementPointId: null,
    };
  }
  if (row.subject_type === "MEASUREMENT_POINT") {
    return {
      ...base,
      subjectType: "MEASUREMENT_POINT",
      assetId: null,
      componentId: null,
      measurementPointId: row.measurement_point_id as MeasurementPointId,
    };
  }
  return {
    ...base,
    subjectType: "ASSET",
    assetId: row.asset_id as AssetId,
    componentId: null,
    measurementPointId: null,
  };
}

export type UpsertMeasurementInput = AssetComponentOrMeasurementPointSubject & {
  tenantId: TenantId;
  metricDefinitionId: MetricDefinitionId;
  timestamp: Date;
  value: number;
  quality: MeasurementQuality;
  /** Vendor provenance — required together to dedupe on re-ingest (last-write-wins). */
  connectorId?: ConnectorId;
  vendorObjectId?: string;
  vendorSensorId?: string;
};

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
      subject_type: input.subjectType,
      asset_id: input.assetId,
      component_id: input.componentId,
      measurement_point_id: input.measurementPointId,
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

  /**
   * Deletes any existing row at this exact (subject, metric, timestamp) — for CALCULATED values
   * with no connector provenance (e.g. curtailment.service.ts), which therefore can't use the
   * vendor-natural-key upsert `upsert()` relies on. Callers delete-then-insert to make re-running
   * for the same day idempotent instead of accumulating duplicate rows.
   */
  async deleteAt(
    tenantId: TenantId,
    metricDefinitionId: MetricDefinitionId,
    subject: { assetId: AssetId } | { measurementPointId: MeasurementPointId },
    timestamp: Date,
  ): Promise<void> {
    let query = this.db
      .deleteFrom("measurements")
      .where("tenant_id", "=", tenantId)
      .where("metric_definition_id", "=", metricDefinitionId)
      .where("timestamp", "=", timestamp);
    query =
      "assetId" in subject
        ? query.where("asset_id", "=", subject.assetId)
        : query.where("measurement_point_id", "=", subject.measurementPointId);
    await query.execute();
  }

  /**
   * All readings for one metric on one subject within a window, ordered by timestamp ascending.
   * Used by the curtailment service (application/curtailment) for two purposes: counter
   * differencing (last - first, for cumulative `_total` metrics) and trapezoidal power-to-energy
   * integration (for `expected_active_power`) — both need the full ordered set, not just the
   * endpoints, since the number of points and their spacing varies by data source.
   */
  async findAllInWindow(
    tenantId: TenantId,
    metricDefinitionId: MetricDefinitionId,
    subject: { assetId: AssetId } | { measurementPointId: MeasurementPointId },
    from: Date,
    to: Date,
  ): Promise<Measurement[]> {
    let query = this.db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("metric_definition_id", "=", metricDefinitionId)
      .where("timestamp", ">=", from)
      .where("timestamp", "<=", to);
    query =
      "assetId" in subject
        ? query.where("asset_id", "=", subject.assetId)
        : query.where("measurement_point_id", "=", subject.measurementPointId);
    const rows = await query.orderBy("timestamp", "asc").execute();
    return rows.map(toDomain);
  }
}
