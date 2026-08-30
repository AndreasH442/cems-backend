import type { SiteAssetComponentOrMeasurementPointSubject } from "../shared/subjects.js";
import type { EventId, TenantId } from "../shared/ids.js";

/** Site XOR Asset XOR Component XOR MeasurementPoint. Event is NOT a Case. */
export type Event = SiteAssetComponentOrMeasurementPointSubject & {
  readonly id: EventId;
  readonly tenantId: TenantId;
  /** e.g. DEVICE_FAULT, COMMUNICATION_LOSS, STRATEGY_CHANGED, EMS_HEARTBEAT — examples in docs/domain-model.md, not a closed registry. */
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
};
