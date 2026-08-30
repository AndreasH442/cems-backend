import type { AssetId, CaseId, CaseSubjectId, TenantId } from "../shared/ids.js";

export const CASE_SUBJECT_ROLES = ["AFFECTED", "ROOT_CAUSE", "CONTRIBUTING"] as const;
export type CaseSubjectRole = (typeof CASE_SUBJECT_ROLES)[number];

/** Genau ein Subject je Zeile — this slice only Asset (Component/MeasurementPoint don't exist yet). */
export interface CaseSubject {
  readonly id: CaseSubjectId;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly assetId: AssetId;
  readonly role: CaseSubjectRole;
}
