import type { Anomaly, AuditorRuleKey } from "../../domain/auditor/anomaly.js";
import type { Case, CaseSeverity } from "../../domain/auditor/case.js";
import type { AssetId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { AnomalyRepository } from "../../infrastructure/repositories/anomaly.repository.js";
import type { CaseEvidenceRepository } from "../../infrastructure/repositories/case-evidence.repository.js";
import type { CaseStatusHistoryRepository } from "../../infrastructure/repositories/case-status-history.repository.js";
import type { CaseSubjectRepository } from "../../infrastructure/repositories/case-subject.repository.js";
import type { CaseRepository } from "../../infrastructure/repositories/case.repository.js";

/** Hartkodierte Einstufung je Regel (docs/first-vertical-slice.md, "Nicht bauen" — keine Priorisierungsformel). */
const SEVERITY_BY_RULE: Record<AuditorRuleKey, CaseSeverity> = {
  BATTERY_SETPOINT_TRACKING_V1: "HIGH",
  PV_SETPOINT_VS_ACTUAL_V1: "MEDIUM",
  MEASUREMENT_MISSING_WITH_HEARTBEAT_V1: "MEDIUM",
  PV_GENERATION_VS_WEATHER_V1: "MEDIUM",
};
const SEVERITY_RANK: Record<CaseSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export interface CaseBuilderDeps {
  readonly cases: CaseRepository;
  readonly caseSubjects: CaseSubjectRepository;
  readonly caseEvidence: CaseEvidenceRepository;
  readonly caseStatusHistory: CaseStatusHistoryRepository;
  readonly anomalies: AnomalyRepository;
}

/**
 * Anomaly → Case (ADR-008): legt einen Case für eine oder mehrere bereits persistierte
 * Anomalies an, verknüpft CaseSubject/CaseEvidence, schreibt case_id auf die Anomalies zurück
 * und protokolliert die initiale Statusänderung.
 */
export class CaseBuilder {
  constructor(private readonly deps: CaseBuilderDeps) {}

  async buildFromAnomalies(tenantId: TenantId, siteId: SiteId, anomalies: readonly Anomaly[]): Promise<Case> {
    if (anomalies.length === 0) {
      throw new Error("CaseBuilder.buildFromAnomalies requires at least one anomaly");
    }

    const severity = anomalies
      .map((a) => SEVERITY_BY_RULE[a.ruleKey])
      .reduce((worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst));

    const kase = await this.deps.cases.insert({
      tenantId,
      siteId,
      severity,
      title: anomalies.length === 1 ? anomalies[0]!.description : `${anomalies.length} Anomalien erkannt`,
      description: anomalies.map((a) => `[${a.ruleKey}] ${a.description}`).join("\n"),
    });

    await this.deps.caseStatusHistory.insert({
      tenantId,
      caseId: kase.id,
      status: "OPEN",
      note: "Case erstellt durch CaseBuilder",
    });

    const subjectAssetIds = new Set<AssetId>(
      anomalies.map((a) => a.assetId).filter((id): id is AssetId => id !== null),
    );
    for (const assetId of subjectAssetIds) {
      await this.deps.caseSubjects.insert({ tenantId, caseId: kase.id, assetId, role: "AFFECTED" });
    }

    for (const anomaly of anomalies) {
      await this.deps.caseEvidence.insert({
        tenantId,
        caseId: kase.id,
        evidenceType: "ANOMALY",
        referenceId: anomaly.id,
      });
      await this.deps.anomalies.attachToCase(tenantId, anomaly.id, kase.id);
    }

    return kase;
  }
}
