import type { MetricDefinition } from "./metric-definition.js";

const BOUND_EPSILON = 1e-6;

/**
 * Real sensor/API data can produce floating-point noise right at a canonical bound — e.g.
 * -2.27e-16 for a cumulative energy counter that should read exactly 0 (IEEE754 double epsilon
 * from the vendor's own delta computation, observed against the real myPowerGrid API 01.09.2026).
 * Values within BOUND_EPSILON of a documented min/max are clamped to the bound instead of
 * rejected; genuinely out-of-bounds values still throw.
 */
export function clampToMetricBounds(
  value: number,
  metric: Pick<MetricDefinition, "key" | "minValue" | "maxValue">,
): number {
  if (metric.minValue !== null) {
    if (value < metric.minValue - BOUND_EPSILON) {
      throw new Error(`Value ${value} for "${metric.key}" is below min ${metric.minValue}`);
    }
    if (value < metric.minValue) return metric.minValue;
  }
  if (metric.maxValue !== null) {
    if (value > metric.maxValue + BOUND_EPSILON) {
      throw new Error(`Value ${value} for "${metric.key}" is above max ${metric.maxValue}`);
    }
    if (value > metric.maxValue) return metric.maxValue;
  }
  return value;
}
