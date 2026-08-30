import type { Selectable } from "kysely";
import type { CaseSubject, CaseSubjectRole } from "../../domain/auditor/case-subject.js";
import type { AssetId, CaseId, CaseSubjectId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { CaseSubjectsTable } from "../db/schema.js";

function toDomain(row: Selectable<CaseSubjectsTable>): CaseSubject {
  return {
    id: row.id as CaseSubjectId,
    tenantId: row.tenant_id as TenantId,
    caseId: row.case_id as CaseId,
    assetId: row.asset_id as AssetId,
    role: row.role as CaseSubjectRole,
  };
}

export interface InsertCaseSubjectInput {
  tenantId: TenantId;
  caseId: CaseId;
  assetId: AssetId;
  role: CaseSubjectRole;
}

export class CaseSubjectRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertCaseSubjectInput): Promise<CaseSubject> {
    const row = await this.db
      .insertInto("case_subjects")
      .values({ tenant_id: input.tenantId, case_id: input.caseId, asset_id: input.assetId, role: input.role })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
