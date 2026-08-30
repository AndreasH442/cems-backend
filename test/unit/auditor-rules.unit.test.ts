import { describe, expect, it } from "vitest";
import {
  evaluateMeasurementMissingWithHeartbeat,
  evaluateSetpointTracking,
  normalizeBatteryActualPower,
  SETPOINT_TOLERANCE_KW,
} from "../../src/application/auditor/rules.js";
import type { AssetId } from "../../src/domain/shared/ids.js";

const ASSET_ID = "asset-1" as AssetId;

describe("normalizeBatteryActualPower (Sign-Normalisierung)", () => {
  it("returns positive when charging dominates", () => {
    expect(normalizeBatteryActualPower(5, 0)).toBe(5);
  });

  it("returns negative when discharging dominates", () => {
    expect(normalizeBatteryActualPower(0, 5)).toBe(-5);
  });

  it("returns zero when idle", () => {
    expect(normalizeBatteryActualPower(0, 0)).toBe(0);
  });
});

describe("evaluateSetpointTracking (Setpoint-Vergleich)", () => {
  it("returns null when the actual value is within tolerance of the setpoint", () => {
    const result = evaluateSetpointTracking({
      assetId: ASSET_ID,
      ruleKey: "BATTERY_SETPOINT_TRACKING_V1",
      setpoint: { value: -5, timestamp: new Date("2026-08-30T10:00:00Z") },
      actual: { value: -5.1, timestamp: new Date("2026-08-30T10:00:30Z") },
    });
    expect(result).toBeNull();
  });

  it("flags an anomaly when the actual value deviates beyond tolerance", () => {
    const result = evaluateSetpointTracking({
      assetId: ASSET_ID,
      ruleKey: "BATTERY_SETPOINT_TRACKING_V1",
      setpoint: { value: -5, timestamp: new Date("2026-08-30T10:00:00Z") },
      actual: { value: 0, timestamp: new Date("2026-08-30T10:00:30Z") },
    });
    expect(result).not.toBeNull();
    expect(result?.ruleKey).toBe("BATTERY_SETPOINT_TRACKING_V1");
    expect(result?.assetId).toBe(ASSET_ID);
    expect(result?.confidence).toBeGreaterThan(0);
    expect(result?.confidence).toBeLessThanOrEqual(1);
  });

  it("returns null when either side is missing (not this rule's concern)", () => {
    expect(
      evaluateSetpointTracking({
        assetId: ASSET_ID,
        ruleKey: "PV_SETPOINT_VS_ACTUAL_V1",
        setpoint: null,
        actual: { value: 1, timestamp: new Date() },
      }),
    ).toBeNull();
    expect(
      evaluateSetpointTracking({
        assetId: ASSET_ID,
        ruleKey: "PV_SETPOINT_VS_ACTUAL_V1",
        setpoint: { value: 1, timestamp: new Date() },
        actual: null,
      }),
    ).toBeNull();
  });

  it("uses at least the absolute tolerance even for a near-zero setpoint", () => {
    const justInside = evaluateSetpointTracking({
      assetId: ASSET_ID,
      ruleKey: "PV_SETPOINT_VS_ACTUAL_V1",
      setpoint: { value: 0, timestamp: new Date() },
      actual: { value: SETPOINT_TOLERANCE_KW, timestamp: new Date() },
    });
    expect(justInside).toBeNull();

    const justOutside = evaluateSetpointTracking({
      assetId: ASSET_ID,
      ruleKey: "PV_SETPOINT_VS_ACTUAL_V1",
      setpoint: { value: 0, timestamp: new Date() },
      actual: { value: SETPOINT_TOLERANCE_KW + 0.01, timestamp: new Date() },
    });
    expect(justOutside).not.toBeNull();
  });
});

describe("evaluateMeasurementMissingWithHeartbeat", () => {
  const window = { windowStart: new Date("2026-08-30T10:00:00Z"), windowEnd: new Date("2026-08-30T10:05:00Z") };

  it("flags an anomaly when the measurement is missing but the EMS heartbeat was present", () => {
    const result = evaluateMeasurementMissingWithHeartbeat({
      assetId: ASSET_ID,
      metricKey: "device_temperature",
      ...window,
      measurementExists: false,
      heartbeatExists: true,
    });
    expect(result?.ruleKey).toBe("MEASUREMENT_MISSING_WITH_HEARTBEAT_V1");
  });

  it("does not flag when the measurement exists", () => {
    expect(
      evaluateMeasurementMissingWithHeartbeat({
        assetId: ASSET_ID,
        metricKey: "device_temperature",
        ...window,
        measurementExists: true,
        heartbeatExists: true,
      }),
    ).toBeNull();
  });

  it("does not flag a total communication outage (no heartbeat either)", () => {
    expect(
      evaluateMeasurementMissingWithHeartbeat({
        assetId: ASSET_ID,
        metricKey: "device_temperature",
        ...window,
        measurementExists: false,
        heartbeatExists: false,
      }),
    ).toBeNull();
  });
});
