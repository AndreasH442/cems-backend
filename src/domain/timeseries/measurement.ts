import type { AssetId, ConnectorId, MeasurementId, MetricDefinitionId, TenantId } from "../shared/ids.js";

export const MEASUREMENT_QUALITIES = ["MEASURED", "CALCULATED", "ESTIMATED", "SUBSTITUTED", "INVALID"] as const;
export type MeasurementQuality = (typeof MEASUREMENT_QUALITIES)[number];

/**
 * Genau ein Subject: Asset XOR Component XOR MeasurementPoint (docs/domain-model.md, ADR-005).
 * This slice only supports Asset (Component/MeasurementPoint don't exist yet).
 * MISSING is never persisted here — it is derived at query time from absent rows.
 */
export interface Measurement {
  readonly id: MeasurementId;
  readonly tenantId: TenantId;
  readonly assetId: AssetId;
  readonly metricDefinitionId: MetricDefinitionId;
  readonly timestamp: Date;
  readonly value: number;
  readonly quality: MeasurementQuality;
  /** Null for measurements not sourced from a vendor ingest (e.g. quality=CALCULATED). */
  readonly connectorId: ConnectorId | null;
  readonly vendorObjectId: string | null;
  readonly vendorSensorId: string | null;
}
