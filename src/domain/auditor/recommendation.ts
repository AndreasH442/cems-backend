import type { CaseId, RecommendationId, TenantId } from "../shared/ids.js";

/** Vorgeschlagene Maßnahme mit erwarteter Wirkung. Kein Recommendation-NLP in diesem Slice. */
export interface Recommendation {
  readonly id: RecommendationId;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly description: string;
  readonly expectedImpact: string | null;
  readonly createdAt: Date;
}
