import type { Selectable } from "kysely";
import type { Anomaly, AuditorRuleKey } from "../../domain/auditor/anomaly.js";
import type { AssetId, AnomalyId, CaseId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { AnomaliesTable } from "../db/schema.js";

function toDomain(row: Selectable<AnomaliesTable>): Anomaly {
  return {
    id: row.id as AnomalyId,
    tenantId: row.tenant_id as TenantId,
    siteId: row.site_id as SiteId,
    assetId: (row.asset_id as AssetId | null) ?? null,
    ruleKey: row.rule_key as AuditorRuleKey,
    confidence: row.confidence,
    detectedAt: row.detected_at,
    description: row.description,
    caseId: (row.case_id as CaseId | null) ?? null,
  };
}

export interface InsertAnomalyInput {
  tenantId: TenantId;
  siteId: SiteId;
  assetId?: AssetId;
  ruleKey: AuditorRuleKey;
  confidence: number;
  detectedAt: Date;
  description: string;
}

export class AnomalyRepository {
  constructor(private readonly db: Db) {}

  /** New anomalies always start without a case (ADR-008) — CaseBuilder attaches one afterwards. */
  async insert(input: InsertAnomalyInput): Promise<Anomaly> {
    const row = await this.db
      .insertInto("anomalies")
      .values({
        tenant_id: input.tenantId,
        site_id: input.siteId,
        asset_id: input.assetId ?? null,
        rule_key: input.ruleKey,
        confidence: input.confidence,
        detected_at: input.detectedAt,
        description: input.description,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async attachToCase(tenantId: TenantId, id: AnomalyId, caseId: CaseId): Promise<Anomaly> {
    const row = await this.db
      .updateTable("anomalies")
      .set({ case_id: caseId })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: AnomalyId): Promise<Anomaly | null> {
    const row = await this.db
      .selectFrom("anomalies")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
