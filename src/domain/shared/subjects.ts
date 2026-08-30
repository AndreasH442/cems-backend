import type { AssetId, ComponentId, MeasurementPointId, SiteId } from "./ids.js";

/**
 * Reusable XOR-subject discriminated unions (docs/domain-model.md: "Asset, Component und
 * MeasurementPoint sind drei unterschiedliche fachliche Konzepte und dürfen nicht vermischt
 * werden"). Each concrete field is `null` on every variant that doesn't own it, so a
 * `toDomain()` mapper can spread a fixed shape regardless of which branch it's building.
 */

/** Measurement / VendorObjectMapping subject: Asset XOR Component XOR MeasurementPoint. */
export type AssetComponentOrMeasurementPointSubject =
  | { subjectType: "ASSET"; assetId: AssetId; componentId: null; measurementPointId: null }
  | { subjectType: "COMPONENT"; assetId: null; componentId: ComponentId; measurementPointId: null }
  | { subjectType: "MEASUREMENT_POINT"; assetId: null; componentId: null; measurementPointId: MeasurementPointId };

/** ControlIntent / AssetState subject: Asset XOR Component (no MeasurementPoint — "nicht steuerbar"). */
export type AssetOrComponentSubject =
  | { subjectType: "ASSET"; assetId: AssetId; componentId: null }
  | { subjectType: "COMPONENT"; assetId: null; componentId: ComponentId };

/** Event subject: Site XOR Asset XOR Component XOR MeasurementPoint. */
export type SiteAssetComponentOrMeasurementPointSubject =
  | { subjectType: "SITE"; siteId: SiteId; assetId: null; componentId: null; measurementPointId: null }
  | { subjectType: "ASSET"; siteId: null; assetId: AssetId; componentId: null; measurementPointId: null }
  | { subjectType: "COMPONENT"; siteId: null; assetId: null; componentId: ComponentId; measurementPointId: null }
  | {
      subjectType: "MEASUREMENT_POINT";
      siteId: null;
      assetId: null;
      componentId: null;
      measurementPointId: MeasurementPointId;
    };
