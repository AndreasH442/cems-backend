import { describe, expect, it } from "vitest";
import { convertVendorValue } from "../../src/connectors/wendeware/mapper.js";

describe("convertVendorValue (unit conversion + sign, docs/domain-model.md VendorMetricMapping)", () => {
  it("passes the raw value through unchanged with identity conversion", () => {
    expect(convertVendorValue(55.3, { unitFactor: 1, unitOffset: 0, signMultiplier: 1 })).toBe(55.3);
  });

  it("applies the unit factor (e.g. W -> kW)", () => {
    expect(convertVendorValue(5300, { unitFactor: 0.001, unitOffset: 0, signMultiplier: 1 })).toBeCloseTo(5.3);
  });

  it("applies the sign multiplier before the offset", () => {
    // -1 * -1 (sign) = 1, then +2 offset => 3
    expect(convertVendorValue(-1, { unitFactor: 1, unitOffset: 2, signMultiplier: -1 })).toBe(3);
  });

  it("applies factor, sign and offset together", () => {
    // 10 * 0.5 * -1 + 1 = -4
    expect(convertVendorValue(10, { unitFactor: 0.5, unitOffset: 1, signMultiplier: -1 })).toBe(-4);
  });
});
