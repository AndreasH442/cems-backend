import type { Selectable } from "kysely";
import type { Case, CaseSeverity, CaseStatus, EconomicImpactQuality } from "../../domain/auditor/case.js";
import type { CaseId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { CasesTable } from "../db/schema.js";

function toDomain(row: Selectable<CasesTable>): Case {
  return {
    id: row.id as CaseId,
    tenantId: row.tenant_id as TenantId,
    siteId: row.site_id as SiteId,
    severity: row.severity as CaseSeverity,
    status: row.status as CaseStatus,
    title: row.title,
    description: row.description,
    economicImpactValue: row.economic_impact_value,
    economicImpactQuality: row.economic_impact_quality as EconomicImpactQuality | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertCaseInput {
  tenantId: TenantId;
  siteId: SiteId;
  severity: CaseSeverity;
  title: string;
  description: string;
  status?: CaseStatus;
}

export class CaseRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertCaseInput): Promise<Case> {
    const row = await this.db
      .insertInto("cases")
      .values({
        tenant_id: input.tenantId,
        site_id: input.siteId,
        severity: input.severity,
        title: input.title,
        description: input.description,
        ...(input.status ? { status: input.status } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async updateStatus(tenantId: TenantId, id: CaseId, status: CaseStatus): Promise<Case> {
    const row = await this.db
      .updateTable("cases")
      .set({ status, updated_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: CaseId): Promise<Case | null> {
    const row = await this.db
      .selectFrom("cases")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
