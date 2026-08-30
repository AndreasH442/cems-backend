import type { ConnectorId, TenantId } from "../../domain/shared/ids.js";
import type { AssetOrComponentSubject } from "../../domain/shared/subjects.js";
import type { ControlIntent } from "../../domain/timeseries/control-intent.js";
import type { ControlIntentRepository } from "../../infrastructure/repositories/control-intent.repository.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";

export type IngestControlIntentInput = AssetOrComponentSubject & {
  tenantId: TenantId;
  metricKey: string;
  timestamp: Date;
  value: number;
  connectorId?: ConnectorId;
  vendorObjectId?: string;
  vendorSensorId?: string;
};

/** Punktuelle Zeitreihe wie Measurement (ADR-007) — no interval-close logic. */
export class ControlIntentIngestionService {
  constructor(
    private readonly controlIntents: ControlIntentRepository,
    private readonly metricDefinitions: MetricDefinitionRepository,
  ) {}

  async ingest(input: IngestControlIntentInput): Promise<ControlIntent> {
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

    return this.controlIntents.upsert({
      ...input,
      metricDefinitionId: metric.id,
      ...(input.connectorId ? { connectorId: input.connectorId } : {}),
      ...(input.vendorObjectId ? { vendorObjectId: input.vendorObjectId } : {}),
      ...(input.vendorSensorId ? { vendorSensorId: input.vendorSensorId } : {}),
    });
  }
}
