import type { Selectable } from "kysely";
import type { MetricCategory, MetricDefinition } from "../../domain/metrics/metric-definition.js";
import type { MetricDefinitionId } from "../../domain/shared/ids.js";
import type { Db } from "../db/kysely.js";
import type { MetricDefinitionsTable } from "../db/schema.js";

function toDomain(row: Selectable<MetricDefinitionsTable>): MetricDefinition {
  return {
    id: row.id as MetricDefinitionId,
    key: row.key,
    category: row.category as MetricCategory,
    canonicalUnit: row.canonical_unit,
    valueType: row.value_type,
    aggregationMethod: row.aggregation_method,
    minValue: row.min_value,
    maxValue: row.max_value,
  };
}

/**
 * Read-mostly: rows come from curated seed migrations (CLAUDE.md — new metrics are never
 * created automatically by a connector), not from application-level inserts at runtime.
 */
export class MetricDefinitionRepository {
  constructor(private readonly db: Db) {}

  async findById(id: MetricDefinitionId): Promise<MetricDefinition | null> {
    const row = await this.db.selectFrom("metric_definitions").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async findByKey(key: string): Promise<MetricDefinition | null> {
    const row = await this.db.selectFrom("metric_definitions").selectAll().where("key", "=", key).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async all(): Promise<MetricDefinition[]> {
    const rows = await this.db.selectFrom("metric_definitions").selectAll().execute();
    return rows.map(toDomain);
  }
}
