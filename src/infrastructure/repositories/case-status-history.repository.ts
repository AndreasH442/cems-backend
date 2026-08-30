import type { Selectable } from "kysely";
import type { CaseStatusHistoryEntry } from "../../domain/auditor/case-status-history.js";
import type { CaseStatus } from "../../domain/auditor/case.js";
import type { CaseId, CaseStatusHistoryId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { CaseStatusHistoryTable } from "../db/schema.js";

function toDomain(row: Selectable<CaseStatusHistoryTable>): CaseStatusHistoryEntry {
  return {
    id: row.id as CaseStatusHistoryId,
    tenantId: row.tenant_id as TenantId,
    caseId: row.case_id as CaseId,
    status: row.status as CaseStatus,
    changedAt: row.changed_at,
    note: row.note,
  };
}

export interface InsertCaseStatusHistoryInput {
  tenantId: TenantId;
  caseId: CaseId;
  status: CaseStatus;
  note?: string;
}

export class CaseStatusHistoryRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertCaseStatusHistoryInput): Promise<CaseStatusHistoryEntry> {
    const row = await this.db
      .insertInto("case_status_history")
      .values({ tenant_id: input.tenantId, case_id: input.caseId, status: input.status, note: input.note ?? null })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
