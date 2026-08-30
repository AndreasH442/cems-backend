import type { TenantId } from "../../domain/shared/ids.js";
import type { AssetOrComponentSubject } from "../../domain/shared/subjects.js";
import type { AssetState } from "../../domain/timeseries/asset-state.js";
import type { AssetStateRepository } from "../../infrastructure/repositories/asset-state.repository.js";

export type IngestAvailabilityStateInput = AssetOrComponentSubject & {
  tenantId: TenantId;
  stateValue: string;
  validFrom: Date;
};

/** Minimal for this slice: only availability_state (docs/first-vertical-slice.md). */
export class AssetStateIngestionService {
  constructor(private readonly assetStates: AssetStateRepository) {}

  async ingestAvailability(input: IngestAvailabilityStateInput): Promise<AssetState> {
    return this.assetStates.insert({ ...input, category: "AVAILABILITY" });
  }
}
