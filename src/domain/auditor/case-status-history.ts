import type { CaseId, CaseStatusHistoryId, TenantId } from "../shared/ids.js";
import type { CaseStatus } from "./case.js";

/** Jede Statusänderung eines Case wird protokolliert. */
export interface CaseStatusHistoryEntry {
  readonly id: CaseStatusHistoryId;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly status: CaseStatus;
  readonly changedAt: Date;
  readonly note: string | null;
}
