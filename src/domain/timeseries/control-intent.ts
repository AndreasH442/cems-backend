import type { AssetOrComponentSubject } from "../shared/subjects.js";
import type { ConnectorId, ControlIntentId, MetricDefinitionId, TenantId } from "../shared/ids.js";

/**
 * Sollwert/Limit — eigene fachliche Datenart, keine Measurement-Quality (ADR-003).
 * Punktuelle Zeitreihe wie Measurement, kein Intervall-Objekt (ADR-007). Subject: Asset XOR
 * Component (kein MeasurementPoint, da nicht steuerbar).
 */
export type ControlIntent = AssetOrComponentSubject & {
  readonly id: ControlIntentId;
  readonly tenantId: TenantId;
  readonly metricDefinitionId: MetricDefinitionId;
  readonly timestamp: Date;
  readonly value: number;
  readonly connectorId: ConnectorId | null;
  readonly vendorObjectId: string | null;
  readonly vendorSensorId: string | null;
};
