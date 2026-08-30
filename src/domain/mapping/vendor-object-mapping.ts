import type {
  AssetId,
  ComponentId,
  ConnectorId,
  MeasurementPointId,
  TenantId,
  VendorObjectMappingId,
} from "../shared/ids.js";

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
  readonly targetType: null;
  readonly targetAssetId: null;
  readonly targetComponentId: null;
  readonly targetMeasurementPointId: null;
}

/** Vendor Object -> Asset XOR Component XOR MeasurementPoint (docs/domain-model.md). */
export interface MappedToAssetVendorObjectMapping extends VendorObjectMappingBase {
  readonly mappingStatus: "AUTO_MAPPED" | "MANUAL_MAPPED" | "VERIFIED";
  readonly targetType: "ASSET";
  readonly targetAssetId: AssetId;
  readonly targetComponentId: null;
  readonly targetMeasurementPointId: null;
}

export interface MappedToComponentVendorObjectMapping extends VendorObjectMappingBase {
  readonly mappingStatus: "AUTO_MAPPED" | "MANUAL_MAPPED" | "VERIFIED";
  readonly targetType: "COMPONENT";
  readonly targetAssetId: null;
  readonly targetComponentId: ComponentId;
  readonly targetMeasurementPointId: null;
}

export interface MappedToMeasurementPointVendorObjectMapping extends VendorObjectMappingBase {
  readonly mappingStatus: "AUTO_MAPPED" | "MANUAL_MAPPED" | "VERIFIED";
  readonly targetType: "MEASUREMENT_POINT";
  readonly targetAssetId: null;
  readonly targetComponentId: null;
  readonly targetMeasurementPointId: MeasurementPointId;
}

export type MappedVendorObjectMapping =
  MappedToAssetVendorObjectMapping | MappedToComponentVendorObjectMapping | MappedToMeasurementPointVendorObjectMapping;

export type VendorObjectMapping = UnmappedVendorObjectMapping | MappedVendorObjectMapping;
