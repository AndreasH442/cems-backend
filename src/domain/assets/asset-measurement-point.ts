import type { AssetId, AssetMeasurementPointId, MeasurementPointId, TenantId } from "../shared/ids.js";

export const ASSET_MEASUREMENT_POINT_RELATION_TYPES = ["PRIMARY", "INPUT", "OUTPUT", "AUXILIARY", "AGGREGATE"] as const;
export type AssetMeasurementPointRelationType = (typeof ASSET_MEASUREMENT_POINT_RELATION_TYPES)[number];

/** n:m Asset <-> MeasurementPoint, zeitlich gültig (docs/domain-model.md). */
export interface AssetMeasurementPoint {
  readonly id: AssetMeasurementPointId;
  readonly tenantId: TenantId;
  readonly assetId: AssetId;
  readonly measurementPointId: MeasurementPointId;
  readonly relationType: AssetMeasurementPointRelationType;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}
