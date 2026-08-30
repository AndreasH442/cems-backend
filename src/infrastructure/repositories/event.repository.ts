import type { Selectable } from "kysely";
import type { Event } from "../../domain/timeseries/event.js";
import type { SiteAssetComponentOrMeasurementPointSubject } from "../../domain/shared/subjects.js";
import type { AssetId, ComponentId, EventId, MeasurementPointId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { EventsTable } from "../db/schema.js";

function toDomain(row: Selectable<EventsTable>): Event {
  const base = {
    id: row.id as EventId,
    tenantId: row.tenant_id as TenantId,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    payload: row.payload as Record<string, unknown>,
  };
  if (row.subject_type === "SITE") {
    return {
      ...base,
      subjectType: "SITE",
      siteId: row.site_id as SiteId,
      assetId: null,
      componentId: null,
      measurementPointId: null,
    };
  }
  if (row.subject_type === "COMPONENT") {
    return {
      ...base,
      subjectType: "COMPONENT",
      siteId: null,
      assetId: null,
      componentId: row.component_id as ComponentId,
      measurementPointId: null,
    };
  }
  if (row.subject_type === "MEASUREMENT_POINT") {
    return {
      ...base,
      subjectType: "MEASUREMENT_POINT",
      siteId: null,
      assetId: null,
      componentId: null,
      measurementPointId: row.measurement_point_id as MeasurementPointId,
    };
  }
  return {
    ...base,
    subjectType: "ASSET",
    siteId: null,
    assetId: row.asset_id as AssetId,
    componentId: null,
    measurementPointId: null,
  };
}

export type InsertEventInput = SiteAssetComponentOrMeasurementPointSubject & {
  tenantId: TenantId;
  eventType: string;
  occurredAt: Date;
  payload?: Record<string, unknown>;
};

export class EventRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertEventInput): Promise<Event> {
    const row = await this.db
      .insertInto("events")
      .values({
        tenant_id: input.tenantId,
        subject_type: input.subjectType,
        site_id: input.siteId,
        asset_id: input.assetId,
        component_id: input.componentId,
        measurement_point_id: input.measurementPointId,
        event_type: input.eventType,
        occurred_at: input.occurredAt,
        payload: JSON.stringify(input.payload ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  /** Used by MEASUREMENT_MISSING_WITH_HEARTBEAT_V1 (ADR-009) to prove the asset was reachable. */
  async existsInWindow(
    tenantId: TenantId,
    assetId: AssetId,
    eventType: string,
    from: Date,
    to: Date,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom("events")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("asset_id", "=", assetId)
      .where("event_type", "=", eventType)
      .where("occurred_at", ">=", from)
      .where("occurred_at", "<=", to)
      .executeTakeFirst();
    return row !== undefined;
  }
}
