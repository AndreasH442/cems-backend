import type { Selectable } from "kysely";
import type { MappingStatus, VendorObjectMapping } from "../../domain/mapping/vendor-object-mapping.js";
import type {
  AssetId,
  ComponentId,
  ConnectorId,
  MeasurementPointId,
  TenantId,
  VendorObjectMappingId,
} from "../../domain/shared/ids.js";
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
    if (row.target_type === "ASSET" && row.target_asset_id) {
      return {
        ...base,
        mappingStatus: status,
        targetType: "ASSET",
        targetAssetId: row.target_asset_id as AssetId,
        targetComponentId: null,
        targetMeasurementPointId: null,
      };
    }
    if (row.target_type === "COMPONENT" && row.target_component_id) {
      return {
        ...base,
        mappingStatus: status,
        targetType: "COMPONENT",
        targetAssetId: null,
        targetComponentId: row.target_component_id as ComponentId,
        targetMeasurementPointId: null,
      };
    }
    if (row.target_type === "MEASUREMENT_POINT" && row.target_measurement_point_id) {
      return {
        ...base,
        mappingStatus: status,
        targetType: "MEASUREMENT_POINT",
        targetAssetId: null,
        targetComponentId: null,
        targetMeasurementPointId: row.target_measurement_point_id as MeasurementPointId,
      };
    }
    throw new Error(`vendor_object_mapping ${row.id} has status ${status} but no valid target`);
  }

  return {
    ...base,
    mappingStatus: status,
    targetType: null,
    targetAssetId: null,
    targetComponentId: null,
    targetMeasurementPointId: null,
  };
}

export interface DiscoverVendorObjectInput {
  tenantId: TenantId;
  connectorId: ConnectorId;
  vendorObjectId: string;
}

type MappingStatusForTarget = "AUTO_MAPPED" | "MANUAL_MAPPED" | "VERIFIED";

export interface MapVendorObjectToAssetInput {
  tenantId: TenantId;
  id: VendorObjectMappingId;
  targetAssetId: AssetId;
  mappingStatus: MappingStatusForTarget;
}

export interface MapVendorObjectToComponentInput {
  tenantId: TenantId;
  id: VendorObjectMappingId;
  targetComponentId: ComponentId;
  mappingStatus: MappingStatusForTarget;
}

export interface MapVendorObjectToMeasurementPointInput {
  tenantId: TenantId;
  id: VendorObjectMappingId;
  targetMeasurementPointId: MeasurementPointId;
  mappingStatus: MappingStatusForTarget;
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
        target_component_id: null,
        target_measurement_point_id: null,
        updated_at: new Date(),
      })
      .where("tenant_id", "=", input.tenantId)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async mapToComponent(input: MapVendorObjectToComponentInput): Promise<VendorObjectMapping> {
    const row = await this.db
      .updateTable("vendor_object_mappings")
      .set({
        mapping_status: input.mappingStatus,
        target_type: "COMPONENT",
        target_asset_id: null,
        target_component_id: input.targetComponentId,
        target_measurement_point_id: null,
        updated_at: new Date(),
      })
      .where("tenant_id", "=", input.tenantId)
      .where("id", "=", input.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async mapToMeasurementPoint(input: MapVendorObjectToMeasurementPointInput): Promise<VendorObjectMapping> {
    const row = await this.db
      .updateTable("vendor_object_mappings")
      .set({
        mapping_status: input.mappingStatus,
        target_type: "MEASUREMENT_POINT",
        target_asset_id: null,
        target_component_id: null,
        target_measurement_point_id: input.targetMeasurementPointId,
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
