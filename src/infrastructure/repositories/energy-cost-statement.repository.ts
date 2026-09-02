import type { Selectable } from "kysely";
import type {
  EnergyCostStatement,
  EnergyCostStatementLine,
  UtilityType,
} from "../../domain/commercial/energy-cost-statement.js";
import type {
  AssetId,
  ConnectorId,
  EnergyCostStatementId,
  EnergyCostStatementLineId,
  SiteId,
  TenantId,
} from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { EnergyCostStatementLinesTable, EnergyCostStatementsTable } from "../db/schema.js";

function toDomain(row: Selectable<EnergyCostStatementsTable>): EnergyCostStatement {
  return {
    id: row.id as EnergyCostStatementId,
    tenantId: row.tenant_id as TenantId,
    siteId: row.site_id as SiteId,
    assetId: (row.asset_id as AssetId | null) ?? null,
    connectorId: (row.connector_id as ConnectorId | null) ?? null,
    supplierClientReference: row.supplier_client_reference,
    connectionReference: row.connection_reference,
    utilityType: row.utility_type as UtilityType,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function lineToDomain(row: Selectable<EnergyCostStatementLinesTable>): EnergyCostStatementLine {
  return {
    id: row.id as EnergyCostStatementLineId,
    tenantId: row.tenant_id as TenantId,
    statementId: row.statement_id as EnergyCostStatementId,
    month: row.month,
    articleName: row.article_name,
    articleGroup: row.article_group,
    taxPercentage: row.tax_percentage,
    sliceFrom: row.slice_from,
    sliceTo: row.slice_to,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    amount: row.amount,
    taxAmount: row.tax_amount,
    extra: (row.extra as Record<string, unknown> | null) ?? null,
    createdAt: row.created_at,
  };
}

export interface UpsertEnergyCostStatementInput {
  tenantId: TenantId;
  siteId: SiteId;
  assetId?: AssetId;
  connectorId?: ConnectorId;
  supplierClientReference: string;
  connectionReference: string;
  utilityType: UtilityType;
  periodYear: number;
  periodMonth: number;
}

export interface InsertEnergyCostStatementLineInput {
  tenantId: TenantId;
  statementId: EnergyCostStatementId;
  month: number;
  articleName: string;
  articleGroup: string;
  taxPercentage?: number | null;
  sliceFrom?: number | null;
  sliceTo?: number | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount: number;
  taxAmount?: number | null;
  extra?: Record<string, unknown> | null;
}

export interface YearlyCostTotal {
  readonly year: number;
  readonly totalAmount: number;
}

export interface ArticleGroupCostTotal {
  readonly articleGroup: string;
  readonly totalAmount: number;
}

export class EnergyCostStatementRepository {
  constructor(private readonly db: Db) {}

  /** Upserts on (tenant_id, connection_reference, period_year, period_month) — re-pulling the same period replaces it, never duplicates. */
  async upsert(input: UpsertEnergyCostStatementInput): Promise<EnergyCostStatement> {
    const row = await this.db
      .insertInto("energy_cost_statements")
      .values({
        tenant_id: input.tenantId,
        site_id: input.siteId,
        asset_id: input.assetId ?? null,
        connector_id: input.connectorId ?? null,
        supplier_client_reference: input.supplierClientReference,
        connection_reference: input.connectionReference,
        utility_type: input.utilityType,
        period_year: input.periodYear,
        period_month: input.periodMonth,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "connection_reference", "period_year", "period_month"]).doUpdateSet({
          asset_id: (eb) => eb.ref("excluded.asset_id"),
          connector_id: (eb) => eb.ref("excluded.connector_id"),
          supplier_client_reference: (eb) => eb.ref("excluded.supplier_client_reference"),
          utility_type: (eb) => eb.ref("excluded.utility_type"),
          updated_at: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: EnergyCostStatementId): Promise<EnergyCostStatement | null> {
    const row = await this.db
      .selectFrom("energy_cost_statements")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findBySite(tenantId: TenantId, siteId: SiteId): Promise<EnergyCostStatement[]> {
    const rows = await this.db
      .selectFrom("energy_cost_statements")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("site_id", "=", siteId)
      .execute();
    return rows.map(toDomain);
  }

  /** Delete-then-insert: a re-pull of the same statement must replace its lines, not accumulate duplicates (same pattern as CurtailmentService.writeResult). */
  async replaceLines(
    tenantId: TenantId,
    statementId: EnergyCostStatementId,
    lines: readonly InsertEnergyCostStatementLineInput[],
  ): Promise<EnergyCostStatementLine[]> {
    await this.db
      .deleteFrom("energy_cost_statement_lines")
      .where("tenant_id", "=", tenantId)
      .where("statement_id", "=", statementId)
      .execute();

    const inserted: EnergyCostStatementLine[] = [];
    for (const line of lines) {
      const row = await this.db
        .insertInto("energy_cost_statement_lines")
        .values({
          tenant_id: tenantId,
          statement_id: statementId,
          month: line.month,
          article_name: line.articleName,
          article_group: line.articleGroup,
          tax_percentage: line.taxPercentage ?? null,
          slice_from: line.sliceFrom ?? null,
          slice_to: line.sliceTo ?? null,
          quantity: line.quantity ?? null,
          unit_price: line.unitPrice ?? null,
          amount: line.amount,
          tax_amount: line.taxAmount ?? null,
          extra: line.extra !== undefined && line.extra !== null ? JSON.stringify(line.extra) : null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      inserted.push(lineToDomain(row));
    }
    return inserted;
  }

  async findLinesByStatement(
    tenantId: TenantId,
    statementId: EnergyCostStatementId,
  ): Promise<EnergyCostStatementLine[]> {
    const rows = await this.db
      .selectFrom("energy_cost_statement_lines")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("statement_id", "=", statementId)
      .execute();
    return rows.map(lineToDomain);
  }

  /** Backend side of the yearly cost-trend chart: total amount (ex-VAT) per year across a site. */
  async sumByYear(tenantId: TenantId, siteId: SiteId, fromYear: number, toYear: number): Promise<YearlyCostTotal[]> {
    const rows = await this.db
      .selectFrom("energy_cost_statements as s")
      .innerJoin("energy_cost_statement_lines as l", "l.statement_id", "s.id")
      .select(["s.period_year"])
      .select((eb) => eb.fn.sum<number>("l.amount").as("total_amount"))
      .where("s.tenant_id", "=", tenantId)
      .where("s.site_id", "=", siteId)
      .where("s.period_year", ">=", fromYear)
      .where("s.period_year", "<=", toYear)
      .groupBy("s.period_year")
      .orderBy("s.period_year", "asc")
      .execute();
    return rows.map((r) => ({ year: r.period_year, totalAmount: Number(r.total_amount) }));
  }

  /** Backend side of the cost-composition chart: total amount (ex-VAT) per article_group across a site/period. */
  async sumByArticleGroup(
    tenantId: TenantId,
    siteId: SiteId,
    fromYear: number,
    toYear: number,
  ): Promise<ArticleGroupCostTotal[]> {
    const rows = await this.db
      .selectFrom("energy_cost_statements as s")
      .innerJoin("energy_cost_statement_lines as l", "l.statement_id", "s.id")
      .select(["l.article_group"])
      .select((eb) => eb.fn.sum<number>("l.amount").as("total_amount"))
      .where("s.tenant_id", "=", tenantId)
      .where("s.site_id", "=", siteId)
      .where("s.period_year", ">=", fromYear)
      .where("s.period_year", "<=", toYear)
      .groupBy("l.article_group")
      .orderBy("l.article_group", "asc")
      .execute();
    return rows.map((r) => ({ articleGroup: r.article_group, totalAmount: Number(r.total_amount) }));
  }
}
