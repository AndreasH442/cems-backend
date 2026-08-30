import type { AssetId, AssetStateId, TenantId } from "../shared/ids.js";

export const ASSET_STATE_CATEGORIES = ["AVAILABILITY", "OPERATION", "COMMUNICATION", "HEALTH"] as const;
export type AssetStateCategory = (typeof ASSET_STATE_CATEGORIES)[number];

/** Zeitlich gültig (valid_from/valid_until), im Gegensatz zu Measurement/ControlIntent. */
export interface AssetState {
  readonly id: AssetStateId;
  readonly tenantId: TenantId;
  readonly assetId: AssetId;
  readonly category: AssetStateCategory;
  readonly stateValue: string;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
}
