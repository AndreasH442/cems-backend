import type { Selectable } from "kysely";
import type { VendorMetricMapping } from "../../domain/mapping/vendor-metric-mapping.js";
import type {
  MetricDefinitionId,
  TenantId,
  VendorMetricMappingId,
  VendorObjectMappingId,
} from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { VendorMetricMappingsTable } from "../db/schema.js";

function toDomain(row: Selectable<VendorMetricMappingsTable>): VendorMetricMapping {
  return {
    id: row.id as VendorMetricMappingId,
    tenantId: row.tenant_id as TenantId,
    vendorObjectMappingId: row.vendor_object_mapping_id as VendorObjectMappingId,
    vendorSensorId: row.vendor_sensor_id,
    metricDefinitionId: row.metric_definition_id as MetricDefinitionId,
    unitFactor: row.unit_factor,
    unitOffset: row.unit_offset,
    signMultiplier: row.sign_multiplier as 1 | -1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface InsertVendorMetricMappingInput {
  tenantId: TenantId;
  vendorObjectMappingId: VendorObjectMappingId;
  vendorSensorId: string;
  metricDefinitionId: MetricDefinitionId;
  unitFactor?: number;
  unitOffset?: number;
  signMultiplier?: 1 | -1;
}

export class VendorMetricMappingRepository {
  constructor(private readonly db: Db) {}

  async insert(input: InsertVendorMetricMappingInput): Promise<VendorMetricMapping> {
    const row = await this.db
      .insertInto("vendor_metric_mappings")
      .values({
        tenant_id: input.tenantId,
        vendor_object_mapping_id: input.vendorObjectMappingId,
        vendor_sensor_id: input.vendorSensorId,
        metric_definition_id: input.metricDefinitionId,
        ...(input.unitFactor !== undefined ? { unit_factor: input.unitFactor } : {}),
        ...(input.unitOffset !== undefined ? { unit_offset: input.unitOffset } : {}),
        ...(input.signMultiplier !== undefined ? { sign_multiplier: input.signMultiplier } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async findById(tenantId: TenantId, id: VendorMetricMappingId): Promise<VendorMetricMapping | null> {
    const row = await this.db
      .selectFrom("vendor_metric_mappings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findBySensor(
    tenantId: TenantId,
    vendorObjectMappingId: VendorObjectMappingId,
    vendorSensorId: string,
  ): Promise<VendorMetricMapping | null> {
    const row = await this.db
      .selectFrom("vendor_metric_mappings")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("vendor_object_mapping_id", "=", vendorObjectMappingId)
      .where("vendor_sensor_id", "=", vendorSensorId)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }
}
