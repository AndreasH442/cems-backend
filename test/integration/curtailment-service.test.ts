import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { CurtailmentService } from "../../src/application/curtailment/curtailment.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import type { AssetId, MeasurementPointId, MetricDefinitionId, TenantId } from "../../src/domain/shared/ids.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { MeasurementPointRepository } from "../../src/infrastructure/repositories/measurement-point.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

const DAY = new Date("2026-08-15T00:00:00Z");
const T_START = new Date("2026-08-15T00:15:00Z");
const T_END = new Date("2026-08-15T23:45:00Z");
const T_MID_1 = new Date("2026-08-15T12:00:00Z");
const T_MID_2 = new Date("2026-08-15T13:00:00Z");

describe("CurtailmentService (real DB)", () => {
  let db: Db;
  let measurements: MeasurementRepository;
  let measurementPoints: MeasurementPointRepository;
  let assets: AssetRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let curtailment: CurtailmentService;

  let generationMetricId: MetricDefinitionId;
  let consumptionMetricId: MetricDefinitionId;
  let exportMetricId: MetricDefinitionId;
  let expectedMetricId: MetricDefinitionId;

  beforeAll(async () => {
    db = await getTestDb();
    measurements = new MeasurementRepository(db);
    measurementPoints = new MeasurementPointRepository(db);
    assets = new AssetRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
    curtailment = new CurtailmentService({
      measurements,
      measurementPoints,
      assets,
      metricDefinitions,
      measurementIngestion: new MeasurementIngestionService(measurements, metricDefinitions),
    });

    generationMetricId = (await metricDefinitions.findByKey("energy_generation_total"))!.id;
    consumptionMetricId = (await metricDefinitions.findByKey("energy_consumption_total"))!.id;
    exportMetricId = (await metricDefinitions.findByKey("energy_export_total"))!.id;
    expectedMetricId = (await metricDefinitions.findByKey("expected_active_power"))!.id;
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function counterPair(
    tenantId: TenantId,
    assetId: AssetId,
    metricDefinitionId: MetricDefinitionId,
    startValue: number,
    endValue: number,
  ): Promise<void> {
    await measurements.upsert({
      tenantId,
      subjectType: "ASSET",
      assetId,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId,
      timestamp: T_START,
      value: startValue,
      quality: "MEASURED",
    });
    await measurements.upsert({
      tenantId,
      subjectType: "ASSET",
      assetId,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId,
      timestamp: T_END,
      value: endValue,
      quality: "MEASURED",
    });
  }

  async function wallboxCounterPair(
    tenantId: TenantId,
    measurementPointId: MeasurementPointId,
    startValue: number,
    endValue: number,
  ): Promise<void> {
    await measurements.upsert({
      tenantId,
      subjectType: "MEASUREMENT_POINT",
      assetId: null,
      componentId: null,
      measurementPointId,
      metricDefinitionId: consumptionMetricId,
      timestamp: T_START,
      value: startValue,
      quality: "MEASURED",
    });
    await measurements.upsert({
      tenantId,
      subjectType: "MEASUREMENT_POINT",
      assetId: null,
      componentId: null,
      measurementPointId,
      metricDefinitionId: consumptionMetricId,
      timestamp: T_END,
      value: endValue,
      quality: "MEASURED",
    });
  }

  async function expectedPowerPair(tenantId: TenantId, assetId: AssetId, kw1: number, kw2: number): Promise<void> {
    await measurements.upsert({
      tenantId,
      subjectType: "ASSET",
      assetId,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId: expectedMetricId,
      timestamp: T_MID_1,
      value: kw1,
      quality: "CALCULATED",
    });
    await measurements.upsert({
      tenantId,
      subjectType: "ASSET",
      assetId,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId: expectedMetricId,
      timestamp: T_MID_2,
      value: kw2,
      quality: "CALCULATED",
    });
  }

  it("classifies a day with both a recoverable and a structural gap, from real counter diffs", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const pvSystem = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "PV_SYSTEM", name: "PV" });
    const inv1 = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "WR1",
      parentAssetId: pvSystem.id,
    });
    const inv2 = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "WR2",
      parentAssetId: pvSystem.id,
    });
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
    });
    const user = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "LOAD", name: "Verbrauch" });
    const wallbox1 = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-1" });
    const wallbox2 = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-2" });
    // Not a wallbox — only carries weather metrics, must NOT contribute to verbrauch even though it's a site MeasurementPoint.
    await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "Standortwetter" });

    await counterPair(tenant.id, inv1.id, generationMetricId, 100, 160); // 60 kWh
    await counterPair(tenant.id, inv2.id, generationMetricId, 50, 90); // 40 kWh -> actualPv = 100 kWh
    await counterPair(tenant.id, grid.id, exportMetricId, 10, 15); // 5 kWh Einspeisung
    await counterPair(tenant.id, user.id, consumptionMetricId, 200, 260); // 60 kWh Allgemeinverbrauch
    await wallboxCounterPair(tenant.id, wallbox1.id, 0, 30); // 30 kWh
    await wallboxCounterPair(tenant.id, wallbox2.id, 5, 15); // 10 kWh -> wallbox = 40 kWh
    // verbrauch = 40 + 60 + 5 = 105 kWh
    await expectedPowerPair(tenant.id, pvSystem.id, 150, 150); // flat 150 kW over 1h -> 150 kWh expected

    const result = await curtailment.computeForDay({
      tenantId: tenant.id,
      siteId: site.id,
      pvSystemAssetId: pvSystem.id,
      gridConnectionAssetId: grid.id,
      userConsumptionAssetId: user.id,
      day: DAY,
    });

    expect(result.skipped).toBe(false);
    expect(result.actualPvKwh).toBeCloseTo(100);
    expect(result.expectedPvKwh).toBeCloseTo(150);
    expect(result.verbrauchKwh).toBeCloseTo(105);
    expect(result.classification).toEqual({ maxUsableKwh: 105, regelungsGapKwh: 5, designGapKwh: 45 });

    const rows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", pvSystem.id)
      .execute();
    const recoverable = rows.find((r) => r.value === 5);
    const structural = rows.find((r) => r.value === 45);
    expect(recoverable?.quality).toBe("CALCULATED");
    expect(structural?.quality).toBe("CALCULATED");
  });

  it("skips the day without writing anything when expected_active_power has fewer than two points", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const pvSystem = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "PV_SYSTEM", name: "PV" });
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
    });
    const user = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "LOAD", name: "Verbrauch" });
    // No expected_active_power data at all for this day.

    const result = await curtailment.computeForDay({
      tenantId: tenant.id,
      siteId: site.id,
      pvSystemAssetId: pvSystem.id,
      gridConnectionAssetId: grid.id,
      userConsumptionAssetId: user.id,
      day: DAY,
    });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("Not enough expected_active_power data");

    const rows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", pvSystem.id)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it("is idempotent — re-running for the same day replaces, not duplicates, the stored result", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const pvSystem = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "PV_SYSTEM", name: "PV" });
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
    });
    const user = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "LOAD", name: "Verbrauch" });
    await counterPair(tenant.id, grid.id, exportMetricId, 0, 0);
    await counterPair(tenant.id, user.id, consumptionMetricId, 0, 100);
    await expectedPowerPair(tenant.id, pvSystem.id, 50, 50);

    const input = {
      tenantId: tenant.id,
      siteId: site.id,
      pvSystemAssetId: pvSystem.id,
      gridConnectionAssetId: grid.id,
      userConsumptionAssetId: user.id,
      day: DAY,
    };
    await curtailment.computeForDay(input);
    await curtailment.computeForDay(input);

    const [recoverableMetric, structuralMetric] = await Promise.all([
      metricDefinitions.findByKey("curtailment_energy_recoverable"),
      metricDefinitions.findByKey("curtailment_energy_structural"),
    ]);
    const rows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", pvSystem.id)
      .where("metric_definition_id", "in", [recoverableMetric!.id, structuralMetric!.id])
      .execute();
    expect(rows).toHaveLength(2); // recoverable + structural, not 4 — a re-run must replace, not duplicate
  });
});
