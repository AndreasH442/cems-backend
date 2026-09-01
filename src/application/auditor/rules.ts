import type { CurtailmentDayResult } from "../curtailment/curtailment.service.js";
import type { AssetId } from "../../domain/shared/ids.js";
import type { AuditorRuleKey } from "../../domain/auditor/anomaly.js";

export interface AnomalyCandidate {
  readonly assetId: AssetId;
  readonly ruleKey: AuditorRuleKey;
  /** 0..1 — simple v1 heuristic, not a documented formula. */
  readonly confidence: number;
  readonly detectedAt: Date;
  readonly description: string;
}

// Assumptions (not from customer data, not documented anywhere) — easy to change, kept as
// named constants so the reasoning is visible at the call site.
export const SETPOINT_TOLERANCE_KW = 0.5;
export const SETPOINT_TOLERANCE_RATIO = 0.1;

/**
 * Sign-Normalisierung: active_power_charge/active_power_discharge are separate non-negative
 * flow metrics (docs/canonical-metrics.md). Convention: positive = charging, negative =
 * discharging, matching how active_power_setpoint is expected to be signed.
 */
export function normalizeBatteryActualPower(chargeKw: number, dischargeKw: number): number {
  return chargeKw - dischargeKw;
}

export interface SetpointReading {
  readonly value: number;
  readonly timestamp: Date;
}

export interface SetpointTrackingInput {
  readonly assetId: AssetId;
  readonly ruleKey: Extract<AuditorRuleKey, "BATTERY_SETPOINT_TRACKING_V1" | "PV_SETPOINT_VS_ACTUAL_V1">;
  readonly setpoint: SetpointReading | null;
  /** Already sign-normalized where applicable (battery: normalizeBatteryActualPower). */
  readonly actual: SetpointReading | null;
}

/** Setpoint-Vergleich mit Toleranz. Shared by BATTERY_SETPOINT_TRACKING_V1 and PV_SETPOINT_VS_ACTUAL_V1. */
export function evaluateSetpointTracking(input: SetpointTrackingInput): AnomalyCandidate | null {
  if (!input.setpoint || !input.actual) return null; // no data to compare — not this rule's concern

  const deviation = Math.abs(input.actual.value - input.setpoint.value);
  const allowed = Math.max(SETPOINT_TOLERANCE_KW, Math.abs(input.setpoint.value) * SETPOINT_TOLERANCE_RATIO);
  if (deviation <= allowed) return null;

  return {
    assetId: input.assetId,
    ruleKey: input.ruleKey,
    confidence: Math.min(1, deviation / (2 * allowed)),
    detectedAt: input.actual.timestamp,
    description:
      `Sollwert ${input.setpoint.value} kW um ${input.setpoint.timestamp.toISOString()} nicht gefolgt: ` +
      `Ist-Wert ${input.actual.value} kW um ${input.actual.timestamp.toISOString()} ` +
      `(Abweichung ${deviation.toFixed(2)} kW, Toleranz ${allowed.toFixed(2)} kW).`,
  };
}

export interface MeasurementMissingInput {
  readonly assetId: AssetId;
  readonly metricKey: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly measurementExists: boolean;
  readonly heartbeatExists: boolean;
}

/**
 * Nur eine Anomaly, wenn im selben Fenster ein EMS-Heartbeat vorlag (Beweis, dass die
 * Verbindung grundsätzlich lebt) — sonst gilt es als Gesamtausfall, nicht als Sensor-Problem.
 */
export function evaluateMeasurementMissingWithHeartbeat(input: MeasurementMissingInput): AnomalyCandidate | null {
  if (input.measurementExists) return null;
  if (!input.heartbeatExists) return null;

  return {
    assetId: input.assetId,
    ruleKey: "MEASUREMENT_MISSING_WITH_HEARTBEAT_V1",
    confidence: 0.8,
    detectedAt: input.windowEnd,
    description:
      `Kein Measurement für "${input.metricKey}" zwischen ${input.windowStart.toISOString()} und ` +
      `${input.windowEnd.toISOString()}, obwohl im selben Fenster ein EMS-Heartbeat vorlag.`,
  };
}

export const CURTAILMENT_REGELUNGS_GAP_FLOOR_KWH = 20;
export const CURTAILMENT_REGELUNGS_GAP_RATIO = 0.15;

export interface GenerationVsWeatherInput {
  readonly assetId: AssetId;
  readonly day: Date;
  readonly result: CurtailmentDayResult;
}

/**
 * Vergleicht tatsächliche PV-Erzeugung mit der wetterbasierten Erwartung (curtailment.service.ts)
 * für einen Tag. Schlägt bewusst nur auf den heilbaren Anteil (regelungsGapKwh) an, nicht auf
 * designGapKwh — eine strukturell überdimensionierte Anlage ist kein täglich neu zu meldender
 * Vorfall. Die Beschreibung nennt trotzdem beide Anteile als Kontext (die vom Kunden gewünschte
 * wetterbasierte Erklärung, warum die Erzeugung abweicht).
 */
export function evaluateGenerationVsWeatherExpectation(input: GenerationVsWeatherInput): AnomalyCandidate | null {
  if (input.result.skipped || !input.result.classification) return null; // no weather data — not this rule's concern

  const { actualPvKwh, expectedPvKwh, verbrauchKwh, classification } = input.result;
  const threshold = Math.max(CURTAILMENT_REGELUNGS_GAP_FLOOR_KWH, expectedPvKwh * CURTAILMENT_REGELUNGS_GAP_RATIO);
  if (classification.regelungsGapKwh <= threshold) return null;

  const dayLabel = input.day.toISOString().slice(0, 10);
  return {
    assetId: input.assetId,
    ruleKey: "PV_GENERATION_VS_WEATHER_V1",
    confidence: Math.min(1, classification.regelungsGapKwh / (2 * threshold)),
    detectedAt: input.day,
    description:
      `PV-Erzeugung am ${dayLabel} weicht von der wetterbasierten Erwartung ab: ` +
      `Ist ${actualPvKwh.toFixed(1)} kWh vs. Erwartung ${expectedPvKwh.toFixed(1)} kWh ` +
      `(Basis: Open-Meteo + PV-Modell), Standort-Verbrauch ${verbrauchKwh.toFixed(1)} kWh. ` +
      `Davon ${classification.regelungsGapKwh.toFixed(1)} kWh regelungsbedingt (heilbar, ` +
      `Toleranz ${threshold.toFixed(1)} kWh) und ${classification.designGapKwh.toFixed(1)} kWh ` +
      `strukturell nicht behebbar (Anlage überdimensioniert relativ zum Verbrauch).`,
  };
}
