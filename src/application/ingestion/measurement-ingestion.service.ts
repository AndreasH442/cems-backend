import type { AssetId, ConnectorId, TenantId } from "../../domain/shared/ids.js";
import type { Measurement, MeasurementQuality } from "../../domain/timeseries/measurement.js";
import type { MeasurementRepository } from "../../infrastructure/repositories/measurement.repository.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";

export interface IngestMeasurementInput {
  tenantId: TenantId;
  assetId: AssetId;
  metricKey: string;
  timestamp: Date;
  value: number;
  quality: MeasurementQuality;
  connectorId?: ConnectorId;
  vendorObjectId?: string;
  vendorSensorId?: string;
}

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
    if (metric.minValue !== null && input.value < metric.minValue) {
      throw new Error(`Value ${input.value} for "${input.metricKey}" is below min ${metric.minValue}`);
    }
    if (metric.maxValue !== null && input.value > metric.maxValue) {
      throw new Error(`Value ${input.value} for "${input.metricKey}" is above max ${metric.maxValue}`);
    }

    return this.measurements.upsert({
      tenantId: input.tenantId,
      assetId: input.assetId,
      metricDefinitionId: metric.id,
      timestamp: input.timestamp,
      value: input.value,
      quality: input.quality,
      ...(input.connectorId ? { connectorId: input.connectorId } : {}),
      ...(input.vendorObjectId ? { vendorObjectId: input.vendorObjectId } : {}),
      ...(input.vendorSensorId ? { vendorSensorId: input.vendorSensorId } : {}),
    });
  }
}
