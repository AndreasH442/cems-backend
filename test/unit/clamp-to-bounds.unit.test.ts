import { describe, expect, it } from "vitest";
import { clampToMetricBounds } from "../../src/domain/metrics/clamp-to-bounds.js";

const METRIC = { key: "energy_charge_total", minValue: 0, maxValue: null };
const BOUNDED_METRIC = { key: "state_of_charge", minValue: 0, maxValue: 100 };

describe("clampToMetricBounds", () => {
  it("passes a value well within bounds through unchanged", () => {
    expect(clampToMetricBounds(42, METRIC)).toBe(42);
  });

  it("clamps IEEE754 floating-point noise just below min to the bound", () => {
    // Exactly the kind of value the real myPowerGrid API produced (01.09.2026).
    expect(clampToMetricBounds(-2.2737367544323206e-16, METRIC)).toBe(0);
  });

  it("clamps floating-point noise just above max to the bound", () => {
    expect(clampToMetricBounds(100 + 1e-10, BOUNDED_METRIC)).toBe(100);
  });

  it("still rejects a value genuinely below min", () => {
    expect(() => clampToMetricBounds(-1, METRIC)).toThrow(/below min/);
  });

  it("still rejects a value genuinely above max", () => {
    expect(() => clampToMetricBounds(150, BOUNDED_METRIC)).toThrow(/above max/);
  });

  it("ignores bounds that are null", () => {
    expect(clampToMetricBounds(-999, { key: "x", minValue: null, maxValue: null })).toBe(-999);
  });
});
