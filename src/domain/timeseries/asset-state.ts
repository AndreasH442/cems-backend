import type { AssetOrComponentSubject } from "../shared/subjects.js";
import type { AssetStateId, TenantId } from "../shared/ids.js";

export const ASSET_STATE_CATEGORIES = ["AVAILABILITY", "OPERATION", "COMMUNICATION", "HEALTH"] as const;
export type AssetStateCategory = (typeof ASSET_STATE_CATEGORIES)[number];

/** Zeitlich gültig (valid_from/valid_until), im Gegensatz zu Measurement/ControlIntent. Subject: Asset XOR Component. */
export type AssetState = AssetOrComponentSubject & {
  readonly id: AssetStateId;
  readonly tenantId: TenantId;
  readonly category: AssetStateCategory;
  readonly stateValue: string;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
};
