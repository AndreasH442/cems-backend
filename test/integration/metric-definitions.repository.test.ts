import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { getTestDb } from "./support/test-db.js";

const SLICE_KEYS = [
  "state_of_charge",
  "active_power_setpoint",
  "active_power_charge",
  "active_power_discharge",
  "temperature_max",
  "active_power_generation",
  "expected_active_power",
  "device_temperature",
  "energy_generation_total",
  "energy_export_total",
  "energy_import_total",
  "energy_consumption_total",
  "energy_charge_total",
  "energy_discharge_total",
  "active_power_consumption",
  "state_of_health",
  "temperature_min",
  "dc_voltage",
  "dc_current",
  "dc_power",
  "reactive_power",
  "grid_energy_price",
  "irradiance",
  "ambient_temperature",
  "wind_speed",
  "cloud_cover",
  "curtailment_energy_recoverable",
  "curtailment_energy_structural",
];

describe("metric definition registry (seeded, global — not truncated between tests)", () => {
  let db: Db;
  let metricDefinitions: MetricDefinitionRepository;

  beforeAll(async () => {
    db = await getTestDb();
    metricDefinitions = new MetricDefinitionRepository(db);
  });

  it("contains exactly the keys needed for this vertical slice", async () => {
    const all = await metricDefinitions.all();
    expect(all.map((m) => m.key).sort()).toEqual([...SLICE_KEYS].sort());
  });

  it("does not seed availability_state (that is an AssetState, not a Metric)", async () => {
    expect(await metricDefinitions.findByKey("availability_state")).toBeNull();
  });

  it("seeds state_of_charge as a bounded percentage in the BATTERY category", async () => {
    const soc = await metricDefinitions.findByKey("state_of_charge");
    expect(soc).toMatchObject({ category: "BATTERY", canonicalUnit: "%", minValue: 0, maxValue: 100 });
  });

  it("rejects a category outside the documented registry", async () => {
    await expect(
      db
        .insertInto("metric_definitions")
        .values({
          key: "not_a_real_metric",
          category: "NOT_A_CATEGORY",
          canonical_unit: "x",
          value_type: "FLOAT",
          aggregation_method: "AVG",
        })
        .execute(),
    ).rejects.toThrow();
  });
});
