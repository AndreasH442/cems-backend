import type { AssetId, ConnectorId, TenantId, VendorObjectMappingId } from "../shared/ids.js";

/** The six-value registry (docs/domain-model.md, "mapping_status") — no other values are valid. */
export const MAPPING_STATUSES = [
  "DISCOVERED",
  "AUTO_MAPPED",
  "MANUAL_MAPPED",
  "VERIFIED",
  "UNMAPPED",
  "REJECTED",
] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

interface VendorObjectMappingBase {
  readonly id: VendorObjectMappingId;
  readonly tenantId: TenantId;
  readonly connectorId: ConnectorId;
  /** Raw vendor identifier, e.g. "bat.1" — never interpreted here, only stored (ADR-004). */
  readonly vendorObjectId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** DISCOVERED/UNMAPPED/REJECTED carry no target (docs/domain-model.md). */
export interface UnmappedVendorObjectMapping extends VendorObjectMappingBase {
  readonly mappingStatus: "DISCOVERED" | "UNMAPPED" | "REJECTED";
  readonly targetAssetId: null;
}

/**
 * This slice only maps to Asset (Component/MeasurementPoint don't exist yet — see
 * docs/first-vertical-slice.md), so the target is modeled as a plain nullable asset id today;
 * a future slice adds targetComponentId/targetMeasurementPointId alongside it.
 */
export interface MappedVendorObjectMapping extends VendorObjectMappingBase {
  readonly mappingStatus: "AUTO_MAPPED" | "MANUAL_MAPPED" | "VERIFIED";
  readonly targetAssetId: AssetId;
}

export type VendorObjectMapping = UnmappedVendorObjectMapping | MappedVendorObjectMapping;
