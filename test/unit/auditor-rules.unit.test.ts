import { describe, expect, it } from "vitest";
import { classifyCurtailment } from "../../src/application/curtailment/classify-curtailment.js";
import type { CurtailmentDayResult } from "../../src/application/curtailment/curtailment.service.js";
import {
  CURTAILMENT_REGELUNGS_GAP_FLOOR_KWH,
  evaluateGenerationVsWeatherExpectation,
  evaluateGridExportLimitExceeded,
  evaluateGridImportBufferUndershoot,
  evaluateMeasurementMissingWithHeartbeat,
  evaluateSetpointTracking,
  normalizeBatteryActualPower,
  parseZeroExportConfiguration,
  SETPOINT_TOLERANCE_KW,
  type ZeroExportConfiguration,
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

describe("evaluateGenerationVsWeatherExpectation", () => {
  const day = new Date("2026-08-15T00:00:00Z");

  function resultFrom(actualPvKwh: number, expectedPvKwh: number, verbrauchKwh: number): CurtailmentDayResult {
    return {
      skipped: false,
      skipReason: null,
      actualPvKwh,
      expectedPvKwh,
      verbrauchKwh,
      classification: classifyCurtailment(actualPvKwh, expectedPvKwh, verbrauchKwh),
    };
  }

  it("returns null when there is no weather data for the day (skipped)", () => {
    const result = evaluateGenerationVsWeatherExpectation({
      assetId: ASSET_ID,
      day,
      result: {
        skipped: true,
        skipReason: "no data",
        actualPvKwh: 0,
        expectedPvKwh: 0,
        verbrauchKwh: 0,
        classification: null,
      },
    });
    expect(result).toBeNull();
  });

  it("returns null when the recoverable gap is within tolerance", () => {
    // expected=100, verbrauch high enough to absorb it all, actual=95 -> regelungsGap=5, well under both the floor and the ratio.
    const result = evaluateGenerationVsWeatherExpectation({ assetId: ASSET_ID, day, result: resultFrom(95, 100, 200) });
    expect(result).toBeNull();
  });

  it("flags an anomaly when the recoverable gap exceeds the materiality threshold", () => {
    // expected=100, verbrauch=200 (not the limiting factor), actual=40 -> regelungsGap=60, clearly above both the absolute floor and 15% of expected.
    const result = evaluateGenerationVsWeatherExpectation({ assetId: ASSET_ID, day, result: resultFrom(40, 100, 200) });
    expect(result?.ruleKey).toBe("PV_GENERATION_VS_WEATHER_V1");
    expect(result?.assetId).toBe(ASSET_ID);
    expect(result?.description).toContain("regelungsbedingt");
    expect(result?.description).toContain("strukturell");
  });

  it("does not flag on a purely structural (design) gap — that's not a daily anomaly", () => {
    // expected=150, verbrauch=80 (the real ceiling), actual=80 -> maxUsable=80, regelungsGap=0, designGap=70.
    const result = evaluateGenerationVsWeatherExpectation({ assetId: ASSET_ID, day, result: resultFrom(80, 150, 80) });
    expect(result).toBeNull();
  });

  it("respects the absolute floor for small plants (percentage alone would be too strict)", () => {
    // expected=10 kWh (tiny plant/day), 15% would be 1.5 kWh, but the 20 kWh floor dominates.
    const result = evaluateGenerationVsWeatherExpectation({ assetId: ASSET_ID, day, result: resultFrom(8, 10, 50) });
    expect(result).toBeNull();
    expect(CURTAILMENT_REGELUNGS_GAP_FLOOR_KWH).toBeGreaterThan(2);
  });
});

describe("parseZeroExportConfiguration", () => {
  it("parses a complete configuration", () => {
    expect(parseZeroExportConfiguration({ bufferKw: 10, exportLimitKwh: 15 })).toEqual({
      bufferKw: 10,
      exportLimitKwh: 15,
    });
  });

  it("returns null when a field is missing", () => {
    expect(parseZeroExportConfiguration({ bufferKw: 10 })).toBeNull();
  });

  it("returns null when a field has the wrong type", () => {
    expect(parseZeroExportConfiguration({ bufferKw: "10", exportLimitKwh: 15 })).toBeNull();
  });

  it("returns null for an empty configuration (no Nulleinspeisung set up)", () => {
    expect(parseZeroExportConfiguration({})).toBeNull();
  });
});

describe("evaluateGridImportBufferUndershoot", () => {
  const day = new Date("2026-08-31T00:00:00Z");
  const config: ZeroExportConfiguration = { bufferKw: 10, exportLimitKwh: 15 };

  it("returns null when the daily minimum import stays at or above the buffer", () => {
    expect(evaluateGridImportBufferUndershoot({ assetId: ASSET_ID, day, minImportKw: 10, config })).toBeNull();
  });

  it("flags an anomaly when the daily minimum import falls below the buffer", () => {
    const result = evaluateGridImportBufferUndershoot({ assetId: ASSET_ID, day, minImportKw: 3, config });
    expect(result?.ruleKey).toBe("GRID_IMPORT_BUFFER_UNDERSHOOT_V1");
    expect(result?.assetId).toBe(ASSET_ID);
    expect(result?.description).toContain("3.00 kW");
    expect(result?.description).toContain("10.00 kW");
  });
});

describe("evaluateGridExportLimitExceeded", () => {
  const day = new Date("2026-08-31T00:00:00Z");
  const config: ZeroExportConfiguration = { bufferKw: 10, exportLimitKwh: 15 };

  it("returns null when the daily export stays at or below the limit", () => {
    expect(evaluateGridExportLimitExceeded({ assetId: ASSET_ID, day, exportKwh: 15, config })).toBeNull();
  });

  it("flags an anomaly when the daily export exceeds the limit", () => {
    const result = evaluateGridExportLimitExceeded({ assetId: ASSET_ID, day, exportKwh: 40, config });
    expect(result?.ruleKey).toBe("GRID_EXPORT_LIMIT_EXCEEDED_V1");
    expect(result?.assetId).toBe(ASSET_ID);
    expect(result?.description).toContain("40.00 kWh");
    expect(result?.description).toContain("15.00 kWh");
  });
});
