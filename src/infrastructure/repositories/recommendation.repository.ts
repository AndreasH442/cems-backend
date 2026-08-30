import type { Selectable } from "kysely";
import type { Recommendation } from "../../domain/auditor/recommendation.js";
import type { CaseId, RecommendationId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { RecommendationsTable } from "../db/schema.js";

function toDomain(row: Selectable<RecommendationsTable>): Recommendation {
  return {
    id: row.id as RecommendationId,
    tenantId: row.tenant_id as TenantId,
    caseId: row.case_id as CaseId,
    description: row.description,
    expectedImpact: row.expected_impact,
    createdAt: row.created_at,
  };
}

export interface InsertRecommendationInput {
  tenantId: TenantId;
  caseId: CaseId;
  description: string;
  expectedImpact?: string;
}

export class RecommendationRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertRecommendationInput): Promise<Recommendation> {
    const row = await this.db
      .insertInto("recommendations")
      .values({
        tenant_id: input.tenantId,
        case_id: input.caseId,
        description: input.description,
        expected_impact: input.expectedImpact ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
