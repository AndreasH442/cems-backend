import type { Selectable } from "kysely";
import type { MappingStatus, VendorObjectMapping } from "../../domain/mapping/vendor-object-mapping.js";
import type { AssetId, ConnectorId, TenantId, VendorObjectMappingId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { VendorObjectMappingsTable } from "../db/schema.js";

function toDomain(row: Selectable<VendorObjectMappingsTable>): VendorObjectMapping {
  const base = {
    id: row.id as VendorObjectMappingId,
    tenantId: row.tenant_id as TenantId,
    connectorId: row.connector_id as ConnectorId,
    vendorObjectId: row.vendor_object_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const status = row.mapping_status as MappingStatus;
  if (status === "AUTO_MAPPED" || status === "MANUAL_MAPPED" || status === "VERIFIED") {
    if (!row.target_asset_id) {
      throw new Error(`vendor_object_mapping ${row.id} has status ${status} but no target_asset_id`);
    }
    return { ...base, mappingStatus: status, targetAssetId: row.target_asset_id as AssetId };
  }
  return { ...base, mappingStatus: status, targetAssetId: null };
}

export interface DiscoverVendorObjectInput {
  tenantId: TenantId;
  connectorId: ConnectorId;
  vendorObjectId: string;
}

export interface MapVendorObjectToAssetInput {
  tenantId: TenantId;
  id: VendorObjectMappingId;
  targetAssetId: AssetId;
  mappingStatus: "AUTO_MAPPED" | "MANUAL_MAPPED" | "VERIFIED";
}

export class VendorObjectMappingRepository {
  constructor(private readonly db: Db) {}

  /** New vendor objects always start as DISCOVERED, never as a mapped status (ADR-004). */
  async discover(input: DiscoverVendorObjectInput): Promise<VendorObjectMapping> {
    const row = await this.db
      .insertInto("vendor_object_mappings")
      .values({
        tenant_id: input.tenantId,
        connector_id: input.connectorId,
        vendor_object_id: input.vendorObjectId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async mapToAsset(input: MapVendorObjectToAssetInput): Promise<VendorObjectMapping> {
    const row = await this.db
      .updateTable("vendor_object_mappings")
      .set({
        mapping_status: input.mappingStatus,
        target_type: "ASSET",
        target_asset_id: input.targetAssetId,
        updated_at: new Date(),
      })
      .where("tenant_id", "=", input.tenantId)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: VendorObjectMappingId): Promise<VendorObjectMapping | null> {
    const row = await this.db
      .selectFrom("vendor_object_mappings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByConnectorAndVendorObjectId(
    tenantId: TenantId,
    connectorId: ConnectorId,
    vendorObjectId: string,
  ): Promise<VendorObjectMapping | null> {
    const row = await this.db
      .selectFrom("vendor_object_mappings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("connector_id", "=", connectorId)
      .where("vendor_object_id", "=", vendorObjectId)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
