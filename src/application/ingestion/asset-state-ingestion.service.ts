import type { AssetId, TenantId } from "../../domain/shared/ids.js";
import type { AssetState } from "../../domain/timeseries/asset-state.js";
import type { AssetStateRepository } from "../../infrastructure/repositories/asset-state.repository.js";

export interface IngestAvailabilityStateInput {
  tenantId: TenantId;
  assetId: AssetId;
  stateValue: string;
  validFrom: Date;
}

/** Minimal for this slice: only availability_state (docs/first-vertical-slice.md). */
export class AssetStateIngestionService {
  constructor(private readonly assetStates: AssetStateRepository) {}

  async ingestAvailability(input: IngestAvailabilityStateInput): Promise<AssetState> {
    return this.assetStates.insert({
      tenantId: input.tenantId,
      assetId: input.assetId,
      category: "AVAILABILITY",
      stateValue: input.stateValue,
      validFrom: input.validFrom,
    });
  }
}
