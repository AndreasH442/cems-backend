import type { Selectable } from "kysely";
import type { Event } from "../../domain/timeseries/event.js";
import type { AssetId, EventId, SiteId, TenantId } from "../../domain/shared/ids.js";
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
    return { ...base, subjectType: "SITE", siteId: row.site_id as SiteId, assetId: null };
  }
  return { ...base, subjectType: "ASSET", siteId: null, assetId: row.asset_id as AssetId };
}

export type InsertEventInput = {
  tenantId: TenantId;
  eventType: string;
  occurredAt: Date;
  payload?: Record<string, unknown>;
} & ({ subjectType: "SITE"; siteId: SiteId } | { subjectType: "ASSET"; assetId: AssetId });

export class EventRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertEventInput): Promise<Event> {
    const row = await this.db
      .insertInto("events")
      .values({
        tenant_id: input.tenantId,
        subject_type: input.subjectType,
        site_id: input.subjectType === "SITE" ? input.siteId : null,
        asset_id: input.subjectType === "ASSET" ? input.assetId : null,
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
