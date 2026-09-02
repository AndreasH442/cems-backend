import { describe, expect, it } from "vitest";
import {
  computeExpectedAcPowerKw,
  DEFAULT_PV_MODEL_PARAMS,
  parsePvSystemConfiguration,
} from "../../src/connectors/open-meteo/pv-model.js";

describe("computeExpectedAcPowerKw", () => {
  it("returns 0 at night (gti <= 0)", () => {
    expect(computeExpectedAcPowerKw({ gtiWm2: 0, tAirC: 20, windMs: 2, kwp: 100, kwAc: 90 })).toBe(0);
    expect(computeExpectedAcPowerKw({ gtiWm2: -5, tAirC: 20, windMs: 2, kwp: 100, kwAc: 90 })).toBe(0);
  });

  it("computes a plausible midday value below the AC ceiling", () => {
    const kw = computeExpectedAcPowerKw({ gtiWm2: 600, tAirC: 20, windMs: 3, kwp: 100, kwAc: 90 });
    // Sanity range, not an exact oracle: well below both kwp (100) and kwAc (90), clearly positive.
    expect(kw).toBeGreaterThan(30);
    expect(kw).toBeLessThan(90);
  });

  it("clips at the AC inverter ceiling under strong irradiance", () => {
    const kw = computeExpectedAcPowerKw({ gtiWm2: 1200, tAirC: 25, windMs: 1, kwp: 100, kwAc: 50 });
    expect(kw).toBeCloseTo(50 * DEFAULT_PV_MODEL_PARAMS.invEff, 5);
  });

  it("never returns a negative value even for an extreme temperature derate", () => {
    const kw = computeExpectedAcPowerKw({ gtiWm2: 100, tAirC: 200, windMs: 0, kwp: 10, kwAc: 9 });
    expect(kw).toBeGreaterThanOrEqual(0);
  });
});

describe("parsePvSystemConfiguration", () => {
  it("parses a complete configuration", () => {
    const config = parsePvSystemConfiguration({
      nominalCapacityKwp: 250,
      acCapacityKw: 220,
      tiltDegrees: 15,
      azimuthDegrees: 5,
    });
    expect(config).toEqual({ nominalCapacityKwp: 250, acCapacityKw: 220, tiltDegrees: 15, azimuthDegrees: 5 });
  });

  it("returns null when a field is missing", () => {
    expect(parsePvSystemConfiguration({ nominalCapacityKwp: 250, acCapacityKw: 220, tiltDegrees: 15 })).toBeNull();
  });

  it("returns null when a field has the wrong type", () => {
    expect(
      parsePvSystemConfiguration({
        nominalCapacityKwp: "250",
        acCapacityKw: 220,
        tiltDegrees: 15,
        azimuthDegrees: 5,
      }),
    ).toBeNull();
  });

  it("returns null for an empty configuration", () => {
    expect(parsePvSystemConfiguration({})).toBeNull();
  });

  it("includes the optional documentation fields when present with the right type", () => {
    const config = parsePvSystemConfiguration({
      nominalCapacityKwp: 250,
      acCapacityKw: 220,
      tiltDegrees: 15,
      azimuthDegrees: 5,
      dcAcRatio: 1.08,
      mounting: "Aufdach",
      shading: "keine",
    });
    expect(config).toEqual({
      nominalCapacityKwp: 250,
      acCapacityKw: 220,
      tiltDegrees: 15,
      azimuthDegrees: 5,
      dcAcRatio: 1.08,
      mounting: "Aufdach",
      shading: "keine",
    });
  });

  it("omits optional documentation fields rather than failing when they have the wrong type", () => {
    const config = parsePvSystemConfiguration({
      nominalCapacityKwp: 250,
      acCapacityKw: 220,
      tiltDegrees: 15,
      azimuthDegrees: 5,
      mounting: 42, // wrong type — dropped, not a parse failure
    });
    expect(config).toEqual({ nominalCapacityKwp: 250, acCapacityKw: 220, tiltDegrees: 15, azimuthDegrees: 5 });
  });
});
