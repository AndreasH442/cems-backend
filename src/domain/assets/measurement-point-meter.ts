import type { AssetId, MeasurementPointId, MeasurementPointMeterId, TenantId } from "../shared/ids.js";

/**
 * Zeitlich gültige Zuordnung eines physischen Zähler-Assets zu einem MeasurementPoint.
 * Bewusst getrennt von AssetMeasurementPoint (strengere Regel: genau ein Asset vom Typ
 * METER). Die Exklusivität ("nur eine aktive Zuordnung gleichzeitig") ist laut
 * docs/domain-model.md "perspektivisch" — hier nur der Typ-Check (meterAssetId muss ein
 * METER-Asset sein), keine Overlap-Exclusion-Constraint.
 */
export interface MeasurementPointMeter {
  readonly id: MeasurementPointMeterId;
  readonly tenantId: TenantId;
  readonly measurementPointId: MeasurementPointId;
  readonly meterAssetId: AssetId;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}
