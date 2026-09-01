import type { ConnectorId, TenantId } from "../../domain/shared/ids.js";
import type { AssetComponentOrMeasurementPointSubject } from "../../domain/shared/subjects.js";
import { clampToMetricBounds } from "../../domain/metrics/clamp-to-bounds.js";
import type { Measurement, MeasurementQuality } from "../../domain/timeseries/measurement.js";
import type { MeasurementRepository } from "../../infrastructure/repositories/measurement.repository.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";

export type IngestMeasurementInput = AssetComponentOrMeasurementPointSubject & {
  tenantId: TenantId;
  metricKey: string;
  timestamp: Date;
  value: number;
  quality: MeasurementQuality;
  connectorId?: ConnectorId;
  vendorObjectId?: string;
  vendorSensorId?: string;
};

/** Resolves the canonical metric key against the curated registry and enforces its bounds before writing. */
export class MeasurementIngestionService {
  constructor(
    private readonly measurements: MeasurementRepository,
    private readonly metricDefinitions: MetricDefinitionRepository,
  ) {}

  async ingest(input: IngestMeasurementInput): Promise<Measurement> {
    const metric = await this.metricDefinitions.findByKey(input.metricKey);
    if (!metric) {
      throw new Error(`Unknown metric key "${input.metricKey}" — not in the canonical registry`);
    }
    const value = clampToMetricBounds(input.value, metric);

    return this.measurements.upsert({
      ...input,
      metricDefinitionId: metric.id,
      value,
      ...(input.connectorId ? { connectorId: input.connectorId } : {}),
      ...(input.vendorObjectId ? { vendorObjectId: input.vendorObjectId } : {}),
      ...(input.vendorSensorId ? { vendorSensorId: input.vendorSensorId } : {}),
    });
  }
}
