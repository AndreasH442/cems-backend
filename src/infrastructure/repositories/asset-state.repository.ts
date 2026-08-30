import type { Selectable } from "kysely";
import type { AssetState, AssetStateCategory } from "../../domain/timeseries/asset-state.js";
import type { AssetOrComponentSubject } from "../../domain/shared/subjects.js";
import type { AssetId, AssetStateId, ComponentId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { AssetStatesTable } from "../db/schema.js";

function toDomain(row: Selectable<AssetStatesTable>): AssetState {
  const base = {
    id: row.id as AssetStateId,
    tenantId: row.tenant_id as TenantId,
    category: row.category as AssetStateCategory,
    stateValue: row.state_value,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  };
  if (row.subject_type === "COMPONENT") {
    return { ...base, subjectType: "COMPONENT", assetId: null, componentId: row.component_id as ComponentId };
  }
  return { ...base, subjectType: "ASSET", assetId: row.asset_id as AssetId, componentId: null };
}

export type InsertAssetStateInput = AssetOrComponentSubject & {
  tenantId: TenantId;
  category: AssetStateCategory;
  stateValue: string;
  validFrom: Date;
  validUntil?: Date;
};

export class AssetStateRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertAssetStateInput): Promise<AssetState> {
    const row = await this.db
      .insertInto("asset_states")
      .values({
        tenant_id: input.tenantId,
        subject_type: input.subjectType,
        asset_id: input.assetId,
        component_id: input.componentId,
        category: input.category,
        state_value: input.stateValue,
        valid_from: input.validFrom,
        valid_until: input.validUntil ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: AssetStateId): Promise<AssetState | null> {
    const row = await this.db
      .selectFrom("asset_states")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
