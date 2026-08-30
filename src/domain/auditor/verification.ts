import type { ActionId, CaseId, TenantId, VerificationId } from "../shared/ids.js";

export const VERIFICATION_RESULTS = [
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "NO_EFFECT",
  "NEGATIVE_EFFECT",
  "INCONCLUSIVE",
] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

/** Erfolgsprüfung nach einer Action. */
export interface Verification {
  readonly id: VerificationId;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly actionId: ActionId;
  readonly result: VerificationResult;
  readonly verifiedAt: Date;
  readonly notes: string | null;
  readonly createdAt: Date;
}
