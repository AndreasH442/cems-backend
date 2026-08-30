import type { AssetId, EventId, SiteId, TenantId } from "../shared/ids.js";

/** Site XOR Asset for this slice (Component/MeasurementPoint don't exist yet). Event is NOT a Case. */
export type EventSubject =
  | { subjectType: "SITE"; siteId: SiteId; assetId: null }
  | {
      subjectType: "ASSET";
      siteId: null;
      assetId: AssetId;
    };

export type Event = EventSubject & {
  readonly id: EventId;
  readonly tenantId: TenantId;
  /** e.g. DEVICE_FAULT, COMMUNICATION_LOSS, STRATEGY_CHANGED, EMS_HEARTBEAT — examples in docs/domain-model.md, not a closed registry. */
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
};
