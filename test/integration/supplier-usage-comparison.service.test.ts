import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { SupplierUsageComparisonService } from "../../src/application/commercial/supplier-usage-comparison.service.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { SupplierUsageReadingRepository } from "../../src/infrastructure/repositories/supplier-usage-reading.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

const FROM = new Date("2026-08-01T00:00:00Z");
const TO = new Date("2026-09-01T00:00:00Z");

describe("SupplierUsageComparisonService (real DB)", () => {
  let db: Db;
  let assets: AssetRepository;
  let measurements: MeasurementRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let supplierUsageReadings: SupplierUsageReadingRepository;
  let comparison: SupplierUsageComparisonService;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    measurements = new MeasurementRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
    supplierUsageReadings = new SupplierUsageReadingRepository(db);
    comparison = new SupplierUsageComparisonService({ measurements, metricDefinitions, supplierUsageReadings });
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("compares the EMS counter-diff against the supplier-reported sum without altering either", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
    });

    const importMetric = (await metricDefinitions.findByKey("energy_import_total"))!;
    await measurements.upsert({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: grid.id,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId: importMetric.id,
      timestamp: FROM,
      value: 1000,
      quality: "MEASURED",
    });
    await measurements.upsert({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: grid.id,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId: importMetric.id,
      timestamp: TO,
      value: 14602.167, // EMS-measured diff = 13602.167 kWh
      quality: "MEASURED",
    });

    await supplierUsageReadings.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      assetId: grid.id,
      connectionReference: "conn-1",
      utilityType: "ele",
      interval: "monthly",
      bucketStart: FROM,
      unit: "kWh",
      conVolume: 13500, // slightly different from EMS — a realistic small discrepancy
    });

    const result = await comparison.compare({
      tenantId: tenant.id,
      gridConnectionAssetId: grid.id,
      connectionReference: "conn-1",
      from: FROM,
      to: TO,
    });

    expect(result.emsImportKwh).toBeCloseTo(13602.167);
    expect(result.supplierReportedKwh).toBeCloseTo(13500);
    expect(result.deltaKwh).toBeCloseTo(13500 - 13602.167);
    expect(result.deltaPct).toBeCloseTo(((13500 - 13602.167) / 13602.167) * 100);

    // Never writes back into the Measurement pipeline — the EMS row is untouched.
    const emsRows = await measurements.findAllInWindow(tenant.id, importMetric.id, { assetId: grid.id }, FROM, TO);
    expect(emsRows).toHaveLength(2);
    expect(emsRows.every((r) => r.quality === "MEASURED")).toBe(true);
  });

  it("returns 0 EMS kWh (not an error) when the EMS has no readings in the window", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
    });
    await supplierUsageReadings.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      assetId: grid.id,
      connectionReference: "conn-1",
      utilityType: "ele",
      interval: "monthly",
      bucketStart: FROM,
      unit: "kWh",
      conVolume: 500,
    });

    const result = await comparison.compare({
      tenantId: tenant.id,
      gridConnectionAssetId: grid.id,
      connectionReference: "conn-1",
      from: FROM,
      to: TO,
    });

    expect(result.emsImportKwh).toBe(0);
    expect(result.supplierReportedKwh).toBe(500);
    expect(result.deltaPct).toBeNull(); // division by zero avoided, not thrown
  });
});
