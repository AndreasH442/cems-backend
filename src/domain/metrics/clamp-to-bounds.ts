import type { MetricDefinition } from "./metric-definition.js";

const BOUND_EPSILON = 0.1;

/**
 * Real sensor/API data can produce noise right at a canonical bound — first observed as IEEE754
 * double epsilon (-2.27e-16) for a cumulative energy counter that should read exactly 0
 * (01.09.2026). A full-day backfill (01.09.2026, docs/data-requirements.md) surfaced the real
 * distribution of this noise: a whole-day survey of every mapped counter/gauge sensor's canonical
 * value against its bound found violations up to -0.084 (active_power_generation, kW), always
 * clustered right at dusk/dawn — the true signal (PV output) is itself near zero there, so
 * measurement/derivative noise is proportionally largest exactly where it can cross a bound.
 * BOUND_EPSILON is set to 0.1 (kW/kWh scale) to comfortably cover that, still negligible against
 * real values (hundreds of kW/kWh for this system) and still far below the magnitude of the
 * *other* real anomaly found in the same survey — multi-hundred-to-thousand-Wh backward jumps
 * mid-series on the same counters (likely periodic resets, not noise) — those stay unclamped and
 * unmasked by this function; they show up as a wrong (understated) delta in counter-diff
 * consumers instead (docs/data-requirements.md, "Nicht-monotone Zähler").
 *
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
