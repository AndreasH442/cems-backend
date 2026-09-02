import { resolveCredentialsFromEnv } from "./credentials.js";
import { fetchCostOverview, fetchUsage, type ScholtUsageInterval, type ScholtUtilityType } from "./client.js";
import type { EnergyCostStatement } from "../../domain/commercial/energy-cost-statement.js";
import type { SupplierUsageReading } from "../../domain/commercial/supplier-usage-reading.js";
import type { Asset } from "../../domain/assets/asset.js";
import type { ConnectorId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { AssetRepository } from "../../infrastructure/repositories/asset.repository.js";
import type { ConnectorRepository } from "../../infrastructure/repositories/connector.repository.js";
import type { EnergyCostStatementRepository } from "../../infrastructure/repositories/energy-cost-statement.repository.js";
import type { SupplierUsageReadingRepository } from "../../infrastructure/repositories/supplier-usage-reading.repository.js";

export interface ScholtIngestDeps {
  readonly connectors: ConnectorRepository;
  readonly assets: AssetRepository;
  readonly energyCostStatements: EnergyCostStatementRepository;
  readonly supplierUsageReadings: SupplierUsageReadingRepository;
}

export interface PullCostOverviewResult {
  readonly statement: EnergyCostStatement;
  readonly lineCount: number;
  readonly totalAmount: number;
}

export interface PullUsageResult {
  readonly readings: readonly SupplierUsageReading[];
  readonly totalConVolume: number;
}

/**
 * Pulls one connection/year/month cost breakdown from the Scholt API (docs/data-requirements-
 * scholt.md, `costoverview`) and writes it as an EnergyCostStatement + lines (ADR-014). No object-
 * /sensor-discovery mapping needed (unlike Wendeware) — the API already returns structured,
 * self-describing objects.
 */
export class ScholtIngestService {
  constructor(private readonly deps: ScholtIngestDeps) {}

  /**
   * Best-effort resolution against the digital-twin master data (docs/master-data-schema.md,
   * Slice 2) — "lieber nichts als raten": no match just leaves assetId null, not an error.
   * Falls back to the connector's own siteId when no GRID_CONNECTION matches.
   */
  private async resolveSiteAndAsset(
    tenantId: TenantId,
    connectorId: ConnectorId,
    connectorSiteId: SiteId | null,
    connectionReference: string,
  ): Promise<{ siteId: SiteId; matchedAsset: Asset | null }> {
    const gridConnections = await this.deps.assets.findByTenantAndType(tenantId, "GRID_CONNECTION");
    const matchedAsset =
      gridConnections.find((a) => (a.configuration["meteringPointId"] as string | undefined) === connectionReference) ??
      null;

    const siteId = matchedAsset?.siteId ?? connectorSiteId;
    if (!siteId) {
      throw new Error(
        `Cannot determine siteId for connection "${connectionReference}" — no GRID_CONNECTION.configuration.meteringPointId match and connector ${connectorId} has no site.`,
      );
    }
    return { siteId, matchedAsset };
  }

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
    const { siteId, matchedAsset } = await this.resolveSiteAndAsset(
      tenantId,
      connectorId,
      connector.siteId,
      connectionReference,
    );

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

  /**
   * Pulls supplier-reported usage (docs/data-requirements-scholt.md, `usage`) and stores it as a
   * SupplierUsageReading — deliberately NOT written into the canonical energy_import/-export
   * Measurement metrics (the EMS stays "the only true" source, explicit user decision 02.09.2026).
   * This is a cross-check/tariff-window (peak/offpeak) signal only.
   */
  async pullUsage(
    tenantId: TenantId,
    connectorId: ConnectorId,
    supplierClientReference: string,
    connectionReference: string,
    utilityType: ScholtUtilityType,
    interval: ScholtUsageInterval,
    from?: string,
    until?: string,
  ): Promise<PullUsageResult> {
    const connector = await this.deps.connectors.findById(tenantId, connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    const creds = resolveCredentialsFromEnv(connector.secretReference);

    const usage = await fetchUsage(creds, supplierClientReference, connectionReference, interval, from, until);
    const { siteId, matchedAsset } = await this.resolveSiteAndAsset(
      tenantId,
      connectorId,
      connector.siteId,
      connectionReference,
    );

    const readings: SupplierUsageReading[] = [];
    for (const u of usage) {
      const reading = await this.deps.supplierUsageReadings.upsert({
        tenantId,
        siteId,
        ...(matchedAsset ? { assetId: matchedAsset.id } : {}),
        connectorId,
        connectionReference,
        utilityType,
        interval,
        bucketStart: new Date(u.datetime),
        unit: u.unit,
        conVolume: u.conVolume,
        conVolumePeak: u.conVolumePeak,
        conVolumeOffpeak: u.conVolumeOffpeak,
      });
      readings.push(reading);
    }

    const totalConVolume = readings.reduce((sum, r) => sum + r.conVolume, 0);
    return { readings, totalConVolume };
  }
}
