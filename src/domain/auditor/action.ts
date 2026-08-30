import type { ActionId, CaseId, RecommendationId, TenantId } from "../shared/ids.js";

/** Tatsächlich durchgeführte Maßnahme. Statischer Textbaustein reicht (kein NLP). */
export interface Action {
  readonly id: ActionId;
  readonly tenantId: TenantId;
  readonly caseId: CaseId;
  readonly recommendationId: RecommendationId | null;
  readonly description: string;
  readonly performedAt: Date;
  readonly createdAt: Date;
}
