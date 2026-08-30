import type { Selectable } from "kysely";
import type { Action } from "../../domain/auditor/action.js";
import type { ActionId, CaseId, RecommendationId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { ActionsTable } from "../db/schema.js";

function toDomain(row: Selectable<ActionsTable>): Action {
  return {
    id: row.id as ActionId,
    tenantId: row.tenant_id as TenantId,
    caseId: row.case_id as CaseId,
    recommendationId: (row.recommendation_id as RecommendationId | null) ?? null,
    description: row.description,
    performedAt: row.performed_at,
    createdAt: row.created_at,
  };
}

export interface InsertActionInput {
  tenantId: TenantId;
  caseId: CaseId;
  description: string;
  performedAt: Date;
  recommendationId?: RecommendationId;
}

export class ActionRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertActionInput): Promise<Action> {
    const row = await this.db
      .insertInto("actions")
      .values({
        tenant_id: input.tenantId,
        case_id: input.caseId,
        recommendation_id: input.recommendationId ?? null,
        description: input.description,
        performed_at: input.performedAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: ActionId): Promise<Action | null> {
    const row = await this.db
      .selectFrom("actions")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
