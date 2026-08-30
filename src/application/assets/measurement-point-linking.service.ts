import type { MeasurementPointMeter } from "../../domain/assets/measurement-point-meter.js";
import type { AssetId, MeasurementPointId, TenantId } from "../../domain/shared/ids.js";
import type { AssetRepository } from "../../infrastructure/repositories/asset.repository.js";
import type { MeasurementPointMeterRepository } from "../../infrastructure/repositories/measurement-point-meter.repository.js";

export interface LinkMeterInput {
  tenantId: TenantId;
  measurementPointId: MeasurementPointId;
  meterAssetId: AssetId;
  validFrom: Date;
}

/**
 * Enforces "genau ein Asset vom Typ METER" (docs/domain-model.md) at the application layer —
 * the DB doesn't check the referenced asset's type, only that it exists.
 */
export class MeasurementPointLinkingService {
  constructor(
    private readonly assets: AssetRepository,
    private readonly measurementPointMeters: MeasurementPointMeterRepository,
  ) {}

  async linkMeter(input: LinkMeterInput): Promise<MeasurementPointMeter> {
    const meterAsset = await this.assets.findById(input.tenantId, input.meterAssetId);
    if (!meterAsset) {
      throw new Error(`Asset ${input.meterAssetId} not found`);
    }
    if (meterAsset.assetType !== "METER") {
      throw new Error(`Asset ${input.meterAssetId} has type ${meterAsset.assetType}, expected METER`);
    }

    return this.measurementPointMeters.insert({
      tenantId: input.tenantId,
      measurementPointId: input.measurementPointId,
      meterAssetId: input.meterAssetId,
      validFrom: input.validFrom,
    });
  }
}
