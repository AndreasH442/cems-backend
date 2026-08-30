import type { CaseEvidenceId, CaseId, TenantId } from "../shared/ids.js";

/** docs/domain-model.md — the eight documented evidence types. */
export const CASE_EVIDENCE_TYPES = [
  "ANOMALY",
  "EVENT",
  "STATE",
  "CONTROL_INTENT",
  "FORECAST",
  "MEASUREMENT_WINDOW",
  "DOCUMENT",
  "MANUAL_NOTE",
] as const;
export type CaseEvidenceType = (typeof CASE_EVIDENCE_TYPES)[number];

/**
 * reference_id ist polymorph und nicht klassisch FK-gesichert — ergänzend zur echten
 * anomalies.case_id-FK (ADR-008), nicht deren Ersatz.
 */
export interface CaseEvidence {
  readonly id: CaseEvidenceId;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly evidenceType: CaseEvidenceType;
  readonly referenceId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}
