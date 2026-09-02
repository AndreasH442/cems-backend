import type { Selectable } from "kysely";
import type { UtilityType } from "../../domain/commercial/energy-cost-statement.js";
import type { SupplierUsageInterval, SupplierUsageReading } from "../../domain/commercial/supplier-usage-reading.js";
import type { AssetId, ConnectorId, SiteId, SupplierUsageReadingId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { SupplierUsageReadingsTable } from "../db/schema.js";

function toDomain(row: Selectable<SupplierUsageReadingsTable>): SupplierUsageReading {
  return {
    id: row.id as SupplierUsageReadingId,
    tenantId: row.tenant_id as TenantId,
    siteId: row.site_id as SiteId,
    assetId: (row.asset_id as AssetId | null) ?? null,
    connectorId: (row.connector_id as ConnectorId | null) ?? null,
    connectionReference: row.connection_reference,
    utilityType: row.utility_type as UtilityType,
    interval: row.interval as SupplierUsageInterval,
    bucketStart: row.bucket_start,
    unit: row.unit,
    conVolume: row.con_volume,
    conVolumePeak: row.con_volume_peak,
    conVolumeOffpeak: row.con_volume_offpeak,
    createdAt: row.created_at,
  };
}

export interface UpsertSupplierUsageReadingInput {
  tenantId: TenantId;
  siteId: SiteId;
  assetId?: AssetId;
  connectorId?: ConnectorId;
  connectionReference: string;
  utilityType: UtilityType;
  interval: SupplierUsageInterval;
  bucketStart: Date;
  unit: string;
  conVolume: number;
  conVolumePeak?: number | null;
  conVolumeOffpeak?: number | null;
}

export interface SupplierUsageTotal {
  readonly totalConVolume: number;
  readonly totalConVolumePeak: number | null;
  readonly totalConVolumeOffpeak: number | null;
  readonly readingCount: number;
}

export class SupplierUsageReadingRepository {
  constructor(private readonly db: Db) {}

  /** Upserts on (tenant_id, connection_reference, interval, bucket_start) — re-pulling the same bucket replaces it, never duplicates. */
  async upsert(input: UpsertSupplierUsageReadingInput): Promise<SupplierUsageReading> {
    const row = await this.db
      .insertInto("supplier_usage_readings")
      .values({
        tenant_id: input.tenantId,
        site_id: input.siteId,
        asset_id: input.assetId ?? null,
        connector_id: input.connectorId ?? null,
        connection_reference: input.connectionReference,
        utility_type: input.utilityType,
        interval: input.interval,
        bucket_start: input.bucketStart,
        unit: input.unit,
        con_volume: input.conVolume,
        con_volume_peak: input.conVolumePeak ?? null,
        con_volume_offpeak: input.conVolumeOffpeak ?? null,
      })
      .onConflict((oc) =>
        oc.columns(["tenant_id", "connection_reference", "interval", "bucket_start"]).doUpdateSet({
          asset_id: (eb) => eb.ref("excluded.asset_id"),
          connector_id: (eb) => eb.ref("excluded.connector_id"),
          con_volume: (eb) => eb.ref("excluded.con_volume"),
          con_volume_peak: (eb) => eb.ref("excluded.con_volume_peak"),
          con_volume_offpeak: (eb) => eb.ref("excluded.con_volume_offpeak"),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findBySite(tenantId: TenantId, siteId: SiteId): Promise<SupplierUsageReading[]> {
    const rows = await this.db
      .selectFrom("supplier_usage_readings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("site_id", "=", siteId)
      .orderBy("bucket_start", "asc")
      .execute();
    return rows.map(toDomain);
  }

  async findInWindow(
    tenantId: TenantId,
    connectionReference: string,
    from: Date,
    to: Date,
  ): Promise<SupplierUsageReading[]> {
    const rows = await this.db
      .selectFrom("supplier_usage_readings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("connection_reference", "=", connectionReference)
      .where("bucket_start", ">=", from)
      .where("bucket_start", "<", to)
      .orderBy("bucket_start", "asc")
      .execute();
    return rows.map(toDomain);
  }

  /** Sum of reported volumes in a window — the supplier side of SupplierUsageComparisonService's cross-check. */
  async sumInWindow(
    tenantId: TenantId,
    connectionReference: string,
    from: Date,
    to: Date,
  ): Promise<SupplierUsageTotal> {
    const row = await this.db
      .selectFrom("supplier_usage_readings")
      .select((eb) => [
        eb.fn.sum<number>("con_volume").as("total_con_volume"),
        eb.fn.sum<number | null>("con_volume_peak").as("total_con_volume_peak"),
        eb.fn.sum<number | null>("con_volume_offpeak").as("total_con_volume_offpeak"),
        eb.fn.countAll<number>().as("reading_count"),
      ])
      .where("tenant_id", "=", tenantId)
      .where("connection_reference", "=", connectionReference)
      .where("bucket_start", ">=", from)
      .where("bucket_start", "<", to)
      .executeTakeFirstOrThrow();
    return {
      totalConVolume: Number(row.total_con_volume ?? 0),
      totalConVolumePeak: row.total_con_volume_peak !== null ? Number(row.total_con_volume_peak) : null,
      totalConVolumeOffpeak: row.total_con_volume_offpeak !== null ? Number(row.total_con_volume_offpeak) : null,
      readingCount: Number(row.reading_count),
    };
  }
}
