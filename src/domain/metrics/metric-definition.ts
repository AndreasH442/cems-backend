import type { MetricDefinitionId } from "../shared/ids.js";

/** Category headers from docs/canonical-metrics.md. */
export const METRIC_CATEGORIES = [
  "POWER",
  "ENERGY",
  "BATTERY",
  "ELECTRICAL",
  "THERMAL",
  "PV_PERFORMANCE",
  "ECONOMIC",
  "SYSTEM_HEALTH",
  "ENVIRONMENT",
] as const;
export type MetricCategory = (typeof METRIC_CATEGORIES)[number];

/**
 * Curated Canonical Metric Registry entry. New rows are never created automatically by a
 * connector (CLAUDE.md) — only via a reviewed migration that also updates docs/canonical-metrics.md.
 */
export interface MetricDefinition {
  readonly id: MetricDefinitionId;
  readonly key: string;
  readonly category: MetricCategory;
  readonly canonicalUnit: string;
  readonly valueType: string;
  readonly aggregationMethod: string;
  readonly minValue: number | null;
  readonly maxValue: number | null;
}
