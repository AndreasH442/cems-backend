import type { AssetId, SiteId, TenantId } from "../shared/ids.js";

/** Canonical Asset Type Registry (docs/canonical-metrics.md). Curated, not vendor-derived. */
export const ASSET_TYPES = [
  "GRID_CONNECTION",
  "PV_SYSTEM",
  "PV_INVERTER",
  "BATTERY_SYSTEM",
  "BATTERY_INVERTER",
  "CHARGING_STATION",
  "METER",
  "LOAD",
  "EMS",
  "GENERATOR",
  "TRANSFORMER",
  "GENERIC_DEVICE",
  "SUB_DISTRIBUTION",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface Asset {
  readonly id: AssetId;
  readonly tenantId: TenantId;
  readonly siteId: SiteId;
  /** Must belong to the same tenant and site (enforced by composite FK), and never to itself. */
  readonly parentAssetId: AssetId | null;
  readonly assetType: AssetType;
  readonly name: string;
  /** Generic asset-type-specific master-data container (ADR-012), e.g. PV plant parameters. */
  readonly configuration: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
