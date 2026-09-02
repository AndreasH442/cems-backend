import type { AssetId, ConnectorId, SiteId, SupplierUsageReadingId, TenantId } from "../shared/ids.js";
import type { UtilityType } from "./energy-cost-statement.js";

export const SUPPLIER_USAGE_INTERVALS = ["yearly", "monthly", "weekly", "daily", "hourly", "quarterly"] as const;
export type SupplierUsageInterval = (typeof SUPPLIER_USAGE_INTERVALS)[number];

/**
 * A supplier-reported (official utility meter) usage reading from the Scholt `usage` endpoint
 * (docs/data-requirements-scholt.md) — one bucket of a chosen interval.
 *
 * **Cross-check signal only, never a source of truth (explicit user decision, 02.09.2026):** the
 * EMS (Wendeware, ingested into the canonical `energy_import`/`energy_export`/... Measurement
 * metrics) remains "the only true" consumption record. This table is deliberately kept separate
 * from the Measurement pipeline — it is never written into `energy_import_total` or any other
 * canonical metric, so a discrepancy between the two sources can never silently corrupt or
 * override the EMS-derived numbers. See SupplierUsageComparisonService for the (read-only,
 * non-authoritative) comparison.
 *
 * `conVolumePeakKwh`/`conVolumeOffpeakKwh` are the supplier's own Hochtarif-/Niedertarif-split
 * (peak/off-peak) — genuinely useful tariff-window information independent of `costoverview`,
 * which is unavailable for this (German) customer (docs/data-requirements-scholt.md).
 */
export interface SupplierUsageReading {
  readonly id: SupplierUsageReadingId;
  readonly tenantId: TenantId;
  readonly siteId: SiteId;
  /** Resolved via GRID_CONNECTION.configuration.meteringPointId == connectionReference, like EnergyCostStatement. */
  readonly assetId: AssetId | null;
  readonly connectorId: ConnectorId | null;
  readonly connectionReference: string;
  readonly utilityType: UtilityType;
  readonly interval: SupplierUsageInterval;
  /** Start of this reading's bucket, as reported by the vendor (its own local-date/time semantics, not reinterpreted). */
  readonly bucketStart: Date;
  readonly unit: string;
  readonly conVolume: number;
  readonly conVolumePeak: number | null;
  readonly conVolumeOffpeak: number | null;
  readonly createdAt: Date;
}
