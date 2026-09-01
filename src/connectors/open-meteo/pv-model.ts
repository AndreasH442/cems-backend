/**
 * PV power model (Sandia cell-temperature + PVWatts DC->AC clipping). Pure, stateless, ported
 * 1:1 from a separately validated Python reference implementation (docs/data-requirements-open-meteo.md)
 * — standard PV-modeling literature (Sandia National Labs cell-temperature model, NREL PVWatts
 * DC->AC clipping), not vendor- or customer-specific.
 */
export interface PvModelParams {
  /** Module temperature coefficient (1/K). Negative: module output falls as cell temperature rises. */
  readonly gamma: number;
  /** Flat DC-side losses (wiring, mismatch, soiling). 0.04 = 4%. */
  readonly dcLoss: number;
  /** Inverter efficiency at rated load. 0.984 = 98.4%. */
  readonly invEff: number;
  /** Sandia cell-temperature constants, derived from GTI and wind speed. */
  readonly sandA: number;
  readonly sandB: number;
}

/** Defaults validated against a real SMA STP 110-60 + typical module string (docs/data-requirements-open-meteo.md). */
export const DEFAULT_PV_MODEL_PARAMS: PvModelParams = {
  gamma: -0.0035,
  dcLoss: 0.04,
  invEff: 0.984,
  sandA: -3.47,
  sandB: -0.0594,
};

export interface PvModelInput {
  /** Global Tilted Irradiance at module plane [W/m^2]. */
  readonly gtiWm2: number;
  /** Air temperature 2m above ground [°C]. */
  readonly tAirC: number;
  /** Wind speed 10m above ground [m/s]. */
  readonly windMs: number;
  /** Plant DC capacity [kWp]. */
  readonly kwp: number;
  /** Inverter AC rated capacity [kW] — the clipping ceiling. */
  readonly kwAc: number;
}

/**
 * Expected AC power [kW] for a PV plant/string, given weather and plant parameters.
 *
 * t_cell   = GTI * exp(sandA + sandB * wind) + tAir
 * t_factor = 1 + gamma * (t_cell - 25)
 * p_dc     = (GTI / 1000) * kwp * t_factor * (1 - dcLoss)
 * p_ac     = min(p_dc, kwAc) * invEff
 *
 * gti <= 0 (night) returns 0. Result is never negative and never exceeds kwAc * invEff (clipping).
 */
export function computeExpectedAcPowerKw(input: PvModelInput, params: PvModelParams = DEFAULT_PV_MODEL_PARAMS): number {
  if (input.gtiWm2 <= 0) return 0;
  const tCell = input.gtiWm2 * Math.exp(params.sandA + params.sandB * input.windMs) + input.tAirC;
  const tFactor = 1 + params.gamma * (tCell - 25);
  const pDc = (input.gtiWm2 / 1000) * input.kwp * tFactor * (1 - params.dcLoss);
  return Math.max(0, Math.min(pDc, input.kwAc) * params.invEff);
}

/** PV plant master data (ADR-012), stored in Asset.configuration for asset_type=PV_SYSTEM. */
export interface PvSystemConfiguration {
  readonly nominalCapacityKwp: number;
  readonly acCapacityKw: number;
  readonly tiltDegrees: number;
  readonly azimuthDegrees: number;
}

/**
 * Parses Asset.configuration into PvSystemConfiguration, or null if incomplete/invalid.
 * "Lieber nichts berechnen als raten" (docs/data-requirements-open-meteo.md) — missing or
 * non-numeric fields mean the asset is silently skipped by the ingest service, not an error.
 */
export function parsePvSystemConfiguration(configuration: Record<string, unknown>): PvSystemConfiguration | null {
  const nominalCapacityKwp = configuration["nominalCapacityKwp"];
  const acCapacityKw = configuration["acCapacityKw"];
  const tiltDegrees = configuration["tiltDegrees"];
  const azimuthDegrees = configuration["azimuthDegrees"];
  if (
    typeof nominalCapacityKwp !== "number" ||
    typeof acCapacityKw !== "number" ||
    typeof tiltDegrees !== "number" ||
    typeof azimuthDegrees !== "number"
  ) {
    return null;
  }
  return { nominalCapacityKwp, acCapacityKw, tiltDegrees, azimuthDegrees };
}
