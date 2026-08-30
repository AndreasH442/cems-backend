import type { AnomalyId, AssetId, CaseId, SiteId, TenantId } from "../shared/ids.js";

/** The three rules of this slice (ADR-009). Versioned keys — open-ended, not a closed registry. */
export const AUDITOR_RULE_KEYS = [
  "BATTERY_SETPOINT_TRACKING_V1",
  "PV_SETPOINT_VS_ACTUAL_V1",
  "MEASUREMENT_MISSING_WITH_HEARTBEAT_V1",
] as const;
export type AuditorRuleKey = (typeof AUDITOR_RULE_KEYS)[number];

/**
 * Von einer Auditor-Regel erkannte Abweichung. Optionales Subject (höchstens eins;
 * site-weite Anomalien haben keins). case_id ist eine echte, nullable FK (ADR-008),
 * zusätzlich zur losen Kopplung über CaseEvidence.
 */
export interface Anomaly {
  readonly id: AnomalyId;
  readonly tenantId: TenantId;
  readonly siteId: SiteId;
  readonly assetId: AssetId | null;
  readonly ruleKey: AuditorRuleKey;
  /** 0..1 */
  readonly confidence: number;
  readonly detectedAt: Date;
  readonly description: string;
  readonly caseId: CaseId | null;
}
