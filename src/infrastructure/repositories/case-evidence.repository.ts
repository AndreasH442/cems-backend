import type { Selectable } from "kysely";
import type { CaseEvidence, CaseEvidenceType } from "../../domain/auditor/case-evidence.js";
import type { CaseEvidenceId, CaseId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { CaseEvidenceTable } from "../db/schema.js";

function toDomain(row: Selectable<CaseEvidenceTable>): CaseEvidence {
  return {
    id: row.id as CaseEvidenceId,
    tenantId: row.tenant_id as TenantId,
    caseId: row.case_id as CaseId,
    evidenceType: row.evidence_type as CaseEvidenceType,
    referenceId: row.reference_id,
    metadata: row.metadata as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export interface InsertCaseEvidenceInput {
  tenantId: TenantId;
  caseId: CaseId;
  evidenceType: CaseEvidenceType;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}

export class CaseEvidenceRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertCaseEvidenceInput): Promise<CaseEvidence> {
    const row = await this.db
      .insertInto("case_evidence")
      .values({
        tenant_id: input.tenantId,
        case_id: input.caseId,
        evidence_type: input.evidenceType,
        reference_id: input.referenceId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
