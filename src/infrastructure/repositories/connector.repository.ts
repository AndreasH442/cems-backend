import type { Selectable } from "kysely";
import type { Connector, ConnectorVendorType } from "../../domain/mapping/connector.js";
import type { ConnectorId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { ConnectorsTable } from "../db/schema.js";

function toDomain(row: Selectable<ConnectorsTable>): Connector {
  return {
    id: row.id as ConnectorId,
    tenantId: row.tenant_id as TenantId,
    siteId: (row.site_id as SiteId | null) ?? null,
    vendorType: row.vendor_type as ConnectorVendorType,
    name: row.name,
    secretReference: row.secret_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertConnectorInput {
  tenantId: TenantId;
  vendorType: ConnectorVendorType;
  name: string;
  secretReference: string;
  siteId?: SiteId;
}

export class ConnectorRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertConnectorInput): Promise<Connector> {
    const row = await this.db
      .insertInto("connectors")
      .values({
        tenant_id: input.tenantId,
        vendor_type: input.vendorType,
        name: input.name,
        secret_reference: input.secretReference,
        site_id: input.siteId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: ConnectorId): Promise<Connector | null> {
    const row = await this.db
      .selectFrom("connectors")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
