import type { Selectable } from "kysely";
import type { Verification, VerificationResult } from "../../domain/auditor/verification.js";
import type { ActionId, CaseId, TenantId, VerificationId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { VerificationsTable } from "../db/schema.js";

function toDomain(row: Selectable<VerificationsTable>): Verification {
  return {
    id: row.id as VerificationId,
    tenantId: row.tenant_id as TenantId,
    caseId: row.case_id as CaseId,
    actionId: row.action_id as ActionId,
    result: row.result as VerificationResult,
    verifiedAt: row.verified_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export interface InsertVerificationInput {
  tenantId: TenantId;
  caseId: CaseId;
  actionId: ActionId;
  result: VerificationResult;
  verifiedAt: Date;
  notes?: string;
}

export class VerificationRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertVerificationInput): Promise<Verification> {
    const row = await this.db
      .insertInto("verifications")
      .values({
        tenant_id: input.tenantId,
        case_id: input.caseId,
        action_id: input.actionId,
        result: input.result,
        verified_at: input.verifiedAt,
        notes: input.notes ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
