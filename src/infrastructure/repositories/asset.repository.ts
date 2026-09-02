import type { Selectable } from "kysely";
import type { Asset, AssetType } from "../../domain/assets/asset.js";
import type { AssetId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { AssetsTable } from "../db/schema.js";

function toDomain(row: Selectable<AssetsTable>): Asset {
  return {
    id: row.id as AssetId,
    tenantId: row.tenant_id as TenantId,
    siteId: row.site_id as SiteId,
    parentAssetId: (row.parent_asset_id as AssetId | null) ?? null,
    assetType: row.asset_type as AssetType,
    name: row.name,
    configuration: row.configuration as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertAssetInput {
  tenantId: TenantId;
  siteId: SiteId;
  assetType: AssetType;
  name: string;
  parentAssetId?: AssetId;
  configuration?: Record<string, unknown>;
}

export class AssetRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertAssetInput): Promise<Asset> {
    const row = await this.db
      .insertInto("assets")
      .values({
        tenant_id: input.tenantId,
        site_id: input.siteId,
        asset_type: input.assetType,
        name: input.name,
        parent_asset_id: input.parentAssetId ?? null,
        ...(input.configuration ? { configuration: JSON.stringify(input.configuration) } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  /** Master-data maintenance (ADR-012) — onboarding scripts today, a future management UI/API later. */
  async updateConfiguration(tenantId: TenantId, id: AssetId, configuration: Record<string, unknown>): Promise<Asset> {
    const row = await this.db
      .updateTable("assets")
      .set({ configuration: JSON.stringify(configuration), updated_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: AssetId): Promise<Asset | null> {
    const row = await this.db
      .selectFrom("assets")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByTypeAndSite(tenantId: TenantId, siteId: SiteId, assetType: AssetType): Promise<Asset[]> {
    const rows = await this.db
      .selectFrom("assets")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("site_id", "=", siteId)
      .where("asset_type", "=", assetType)
      .execute();
    return rows.map(toDomain);
  }

  /** All assets of a tenant matching one asset_type, across every site — used by the Auditor rule registry (application/auditor/rule-registry.ts) to auto-discover which assets a rule applies to. */
  async findByTenantAndType(tenantId: TenantId, assetType: AssetType): Promise<Asset[]> {
    const rows = await this.db
      .selectFrom("assets")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("asset_type", "=", assetType)
      .execute();
    return rows.map(toDomain);
  }

  async findByParent(tenantId: TenantId, parentAssetId: AssetId): Promise<Asset[]> {
    const rows = await this.db
      .selectFrom("assets")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("parent_asset_id", "=", parentAssetId)
      .execute();
    return rows.map(toDomain);
  }
}
