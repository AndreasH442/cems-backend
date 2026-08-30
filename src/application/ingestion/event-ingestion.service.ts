import type { AssetId, TenantId } from "../../domain/shared/ids.js";
import type { Event } from "../../domain/timeseries/event.js";
import type { EventRepository } from "../../infrastructure/repositories/event.repository.js";

export interface IngestEmsHeartbeatInput {
  tenantId: TenantId;
  assetId: AssetId;
  occurredAt: Date;
  payload?: Record<string, unknown>;
}

/** For this slice: EMS heartbeats only (docs/first-vertical-slice.md). */
export class EventIngestionService {
  constructor(private readonly events: EventRepository) {}

  async ingestEmsHeartbeat(input: IngestEmsHeartbeatInput): Promise<Event> {
    return this.events.insert({
      tenantId: input.tenantId,
      subjectType: "ASSET",
      siteId: null,
      assetId: input.assetId,
      componentId: null,
      measurementPointId: null,
      eventType: "EMS_HEARTBEAT",
      occurredAt: input.occurredAt,
      ...(input.payload ? { payload: input.payload } : {}),
    });
  }
}
