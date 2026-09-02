import { resolveCredentialsFromEnv } from "./credentials.js";
import { fetchCostOverview, type ScholtUtilityType } from "./client.js";
import type { EnergyCostStatement } from "../../domain/commercial/energy-cost-statement.js";
import type { ConnectorId, TenantId } from "../../domain/shared/ids.js";
import type { AssetRepository } from "../../infrastructure/repositories/asset.repository.js";
import type { ConnectorRepository } from "../../infrastructure/repositories/connector.repository.js";
import type { EnergyCostStatementRepository } from "../../infrastructure/repositories/energy-cost-statement.repository.js";

export interface ScholtIngestDeps {
  readonly connectors: ConnectorRepository;
  readonly assets: AssetRepository;
  readonly energyCostStatements: EnergyCostStatementRepository;
}

export interface PullCostOverviewResult {
  readonly statement: EnergyCostStatement;
  readonly lineCount: number;
  readonly totalAmount: number;
}

/**
 * Pulls one connection/year/month cost breakdown from the Scholt API (docs/data-requirements-
 * scholt.md, `costoverview`) and writes it as an EnergyCostStatement + lines (ADR-014). No object-
 * /sensor-discovery mapping needed (unlike Wendeware) — the API already returns structured,
 * self-describing objects.
 */
export class ScholtIngestService {
  constructor(private readonly deps: ScholtIngestDeps) {}

  async pullCostOverview(
    tenantId: TenantId,
    connectorId: ConnectorId,
    supplierClientReference: string,
    connectionReference: string,
    utilityType: ScholtUtilityType,
    year: number,
    month: number,
  ): Promise<PullCostOverviewResult> {
    const connector = await this.deps.connectors.findById(tenantId, connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    const creds = resolveCredentialsFromEnv(connector.secretReference);

    const lines = await fetchCostOverview(creds, supplierClientReference, connectionReference, year, month);

    // Best-effort resolution against the digital-twin master data (docs/master-data-schema.md,
    // Slice 2) — "lieber nichts als raten": no match just leaves assetId null, not an error.
    const gridConnections = await this.deps.assets.findByTenantAndType(tenantId, "GRID_CONNECTION");
    const matchedAsset = gridConnections.find(
      (a) => (a.configuration["meteringPointId"] as string | undefined) === connectionReference,
    );

    const siteId = matchedAsset?.siteId ?? connector.siteId;
    if (!siteId) {
      throw new Error(
        `Cannot determine siteId for connection "${connectionReference}" — no GRID_CONNECTION.configuration.meteringPointId match and connector ${connectorId} has no site.`,
      );
    }

    const statement = await this.deps.energyCostStatements.upsert({
      tenantId,
      siteId,
      ...(matchedAsset ? { assetId: matchedAsset.id } : {}),
      connectorId,
      supplierClientReference,
      connectionReference,
      utilityType,
      periodYear: year,
      periodMonth: month,
    });

    const insertedLines = await this.deps.energyCostStatements.replaceLines(
      tenantId,
      statement.id,
      lines.map((l) => ({
        tenantId,
        statementId: statement.id,
        month: l.month,
        articleName: l.articleName,
        articleGroup: l.articleGroup,
        taxPercentage: l.taxPercentage,
        sliceFrom: l.sliceFrom,
        sliceTo: l.sliceTo,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        taxAmount: l.taxAmount,
        extra: l.extra,
      })),
    );

    const totalAmount = insertedLines.reduce((sum, l) => sum + l.amount, 0);
    return { statement, lineCount: insertedLines.length, totalAmount };
  }
}
