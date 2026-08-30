import type { Selectable } from "kysely";
import type { ControlIntent } from "../../domain/timeseries/control-intent.js";
import type { AssetOrComponentSubject } from "../../domain/shared/subjects.js";
import type {
  AssetId,
  ComponentId,
  ConnectorId,
  ControlIntentId,
  MetricDefinitionId,
  TenantId,
} from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { ControlIntentsTable } from "../db/schema.js";

function toDomain(row: Selectable<ControlIntentsTable>): ControlIntent {
  const base = {
    id: row.id as ControlIntentId,
    tenantId: row.tenant_id as TenantId,
    metricDefinitionId: row.metric_definition_id as MetricDefinitionId,
    timestamp: row.timestamp,
    value: row.value,
    connectorId: (row.connector_id as ConnectorId | null) ?? null,
    vendorObjectId: row.vendor_object_id,
    vendorSensorId: row.vendor_sensor_id,
  };
  if (row.subject_type === "COMPONENT") {
    return { ...base, subjectType: "COMPONENT", assetId: null, componentId: row.component_id as ComponentId };
  }
  return { ...base, subjectType: "ASSET", assetId: row.asset_id as AssetId, componentId: null };
}

export type UpsertControlIntentInput = AssetOrComponentSubject & {
  tenantId: TenantId;
  metricDefinitionId: MetricDefinitionId;
  timestamp: Date;
  value: number;
  connectorId?: ConnectorId;
  vendorObjectId?: string;
  vendorSensorId?: string;
};

export class ControlIntentRepository {
  constructor(private readonly db: Db) {}

  /** Same dedup/upsert semantics as MeasurementRepository.upsert (ADR-007: punktuelle Zeitreihe). */
  async upsert(input: UpsertControlIntentInput): Promise<ControlIntent> {
    const values = {
      tenant_id: input.tenantId,
      subject_type: input.subjectType,
      asset_id: input.assetId,
      component_id: input.componentId,
      metric_definition_id: input.metricDefinitionId,
      timestamp: input.timestamp,
      value: input.value,
      connector_id: input.connectorId ?? null,
      vendor_object_id: input.vendorObjectId ?? null,
      vendor_sensor_id: input.vendorSensorId ?? null,
    };

    if (!input.connectorId) {
      const row = await this.db.insertInto("control_intents").values(values).returningAll().executeTakeFirstOrThrow();
      return toDomain(row);
    }

    const row = await this.db
      .insertInto("control_intents")
      .values(values)
      .onConflict((oc) =>
        oc
          .columns(["tenant_id", "connector_id", "vendor_object_id", "vendor_sensor_id", "timestamp"])
          .where("connector_id", "is not", null)
          .doUpdateSet({ value: (eb) => eb.ref("excluded.value") }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findLatestBefore(
    tenantId: TenantId,
    assetId: AssetId,
    metricDefinitionId: MetricDefinitionId,
    before: Date,
  ): Promise<ControlIntent | null> {
    const row = await this.db
      .selectFrom("control_intents")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("asset_id", "=", assetId)
      .where("metric_definition_id", "=", metricDefinitionId)
      .where("timestamp", "<=", before)
      .orderBy("timestamp", "desc")
      .limit(1)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
