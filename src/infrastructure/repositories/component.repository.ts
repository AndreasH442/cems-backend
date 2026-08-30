import type { Selectable } from "kysely";
import type { Component, ComponentType } from "../../domain/assets/component.js";
import type { AssetId, ComponentId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { ComponentsTable } from "../db/schema.js";

function toDomain(row: Selectable<ComponentsTable>): Component {
  return {
    id: row.id as ComponentId,
    tenantId: row.tenant_id as TenantId,
    assetId: row.asset_id as AssetId,
    componentType: row.component_type as ComponentType,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertComponentInput {
  tenantId: TenantId;
  assetId: AssetId;
  componentType: ComponentType;
  name: string;
}

export class ComponentRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertComponentInput): Promise<Component> {
    const row = await this.db
      .insertInto("components")
      .values({
        tenant_id: input.tenantId,
        asset_id: input.assetId,
        component_type: input.componentType,
        name: input.name,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: ComponentId): Promise<Component | null> {
    const row = await this.db
      .selectFrom("components")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
