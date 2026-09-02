import type {
  AssetId,
  ConnectorId,
  EnergyCostStatementId,
  EnergyCostStatementLineId,
  SiteId,
  TenantId,
} from "../shared/ids.js";

export const UTILITY_TYPES = ["ele", "gas"] as const;
export type UtilityType = (typeof UTILITY_TYPES)[number];

/**
 * A cost breakdown for one connection/period, as returned by the Scholt `costoverview` endpoint
 * (docs/data-requirements-scholt.md). Not a literal issued invoice with an invoice number — the
 * vendor API doesn't provide one — named after the vendor's own "costoverview" terminology
 * (ADR-014).
 */
export interface EnergyCostStatement {
  readonly id: EnergyCostStatementId;
  readonly tenantId: TenantId;
  readonly siteId: SiteId;
  /** Resolved via GRID_CONNECTION.configuration.meteringPointId == connectionReference (Slice 2 master data); null if no match. */
  readonly assetId: AssetId | null;
  readonly connectorId: ConnectorId | null;
  readonly supplierClientReference: string;
  readonly connectionReference: string;
  readonly utilityType: UtilityType;
  readonly periodYear: number;
  /**
   * Always set — the vendor API also allows a month-less yearly overview, but the connector
   * always requests per month (matches the vendor doc's own example, `year=<year>&month=<month>`)
   * so the idempotency key stays a plain unique constraint instead of a NULL-handling expression
   * index.
   */
  readonly periodMonth: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One cost line within a statement. `articleGroup` is free text, not a canonical enum — the
 * vendor's own documentation says further groups may be added later (ADR-014).
 */
export interface EnergyCostStatementLine {
  readonly id: EnergyCostStatementLineId;
  readonly tenantId: TenantId;
  readonly statementId: EnergyCostStatementId;
  /** Each line carries its own month, even within a yearly-overview statement (real API shape). */
  readonly month: number;
  readonly articleName: string;
  readonly articleGroup: string;
  readonly taxPercentage: number | null;
  readonly sliceFrom: number | null;
  readonly sliceTo: number | null;
  readonly quantity: number | null;
  readonly unitPrice: number | null;
  /** Excludes VAT, as delivered by the API. */
  readonly amount: number;
  readonly taxAmount: number | null;
  /** Vendor-defined, opaque passthrough (e.g. {"utilitytariff": "peak"}) — never interpreted (ADR-004). */
  readonly extra: Record<string, unknown> | null;
  readonly createdAt: Date;
}
