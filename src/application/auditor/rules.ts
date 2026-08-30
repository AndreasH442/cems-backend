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
