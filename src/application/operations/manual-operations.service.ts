import type { AuditorRuleKey } from "../../domain/auditor/anomaly.js";
import type { Action } from "../../domain/auditor/action.js";
import type { Verification, VerificationResult } from "../../domain/auditor/verification.js";
import type { ActionId, CaseId, TenantId } from "../../domain/shared/ids.js";
import type { ActionRepository } from "../../infrastructure/repositories/action.repository.js";
import type { CaseStatusHistoryRepository } from "../../infrastructure/repositories/case-status-history.repository.js";
import type { CaseRepository } from "../../infrastructure/repositories/case.repository.js";
import type { VerificationRepository } from "../../infrastructure/repositories/verification.repository.js";

/** Statischer Textbaustein — kein Recommendation-NLP (docs/first-vertical-slice.md). */
function staticActionDescription(ruleKey: AuditorRuleKey): string {
  return `Manuelle Korrekturmaßnahme für ${ruleKey} durchgeführt.`;
}

export interface ManualOperationsDeps {
  readonly actions: ActionRepository;
  readonly verifications: VerificationRepository;
  readonly cases: CaseRepository;
  readonly caseStatusHistory: CaseStatusHistoryRepository;
}

/** Einfache manuelle Action-/Verification-Erstellung (docs/first-vertical-slice.md, Services). */
export class ManualOperationsService {
  constructor(private readonly deps: ManualOperationsDeps) {}

  async recordAction(tenantId: TenantId, caseId: CaseId, ruleKey: AuditorRuleKey, performedAt: Date): Promise<Action> {
    const action = await this.deps.actions.insert({
      tenantId,
      caseId,
      description: staticActionDescription(ruleKey),
      performedAt,
    });
    await this.deps.cases.updateStatus(tenantId, caseId, "IN_PROGRESS");
    await this.deps.caseStatusHistory.insert({
      tenantId,
      caseId,
      status: "IN_PROGRESS",
      note: `Action erfasst: ${action.id}`,
    });
    return action;
  }

  /**
   * The caller re-evaluates the case's auditor rule (application/auditor/rules.ts) after the
   * action and passes whether it still fires — this service only turns that into a
   * Verification record and, on SUCCESS, resolves the case.
   */
  async verifyAction(
    tenantId: TenantId,
    caseId: CaseId,
    actionId: ActionId,
    ruleStillFires: boolean,
    verifiedAt: Date,
  ): Promise<Verification> {
    const result: VerificationResult = ruleStillFires ? "NO_EFFECT" : "SUCCESS";
    const verification = await this.deps.verifications.insert({ tenantId, caseId, actionId, result, verifiedAt });

    if (result === "SUCCESS") {
      await this.deps.cases.updateStatus(tenantId, caseId, "RESOLVED");
      await this.deps.caseStatusHistory.insert({
        tenantId,
        caseId,
        status: "RESOLVED",
        note: `Verification ${verification.id}: SUCCESS`,
      });
    }

    return verification;
  }
}
