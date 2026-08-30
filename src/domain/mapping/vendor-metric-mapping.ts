import type { MetricDefinitionId, TenantId, VendorMetricMappingId, VendorObjectMappingId } from "../shared/ids.js";

/**
 * Vendor Sensor → Canonical Metric, with unit conversion (factor/offset) and sign normalization.
 * No free-form expressions (docs/domain-model.md).
 */
export interface VendorMetricMapping {
  readonly id: VendorMetricMappingId;
  readonly tenantId: TenantId;
  readonly vendorObjectMappingId: VendorObjectMappingId;
  /** Raw vendor sensor identifier — never interpreted here, only stored (ADR-004). */
  readonly vendorSensorId: string;
  readonly metricDefinitionId: MetricDefinitionId;
  readonly unitFactor: number;
  readonly unitOffset: number;
  /** Exactly 1 or -1. */
  readonly signMultiplier: 1 | -1;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
