import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { GridComplianceService } from "../../src/application/grid-compliance/grid-compliance.service.js";
import type { AssetId, TenantId } from "../../src/domain/shared/ids.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

const DAY = new Date("2026-08-31T00:00:00Z");
const T1 = new Date("2026-08-31T08:00:00Z");
const T2 = new Date("2026-08-31T12:00:00Z");
const T3 = new Date("2026-08-31T16:00:00Z");

describe("GridComplianceService (real DB)", () => {
  let db: Db;
  let assets: AssetRepository;
  let measurements: MeasurementRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let gridCompliance: GridComplianceService;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    measurements = new MeasurementRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
    gridCompliance = new GridComplianceService({ assets, measurements, metricDefinitions });
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function importReading(tenantId: TenantId, assetId: AssetId, timestamp: Date, kw: number): Promise<void> {
    const metric = (await metricDefinitions.findByKey("active_power_import"))!;
    await measurements.upsert({
      tenantId,
      subjectType: "ASSET",
      assetId,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId: metric.id,
      timestamp,
      value: kw,
      quality: "MEASURED",
    });
  }

  async function exportCounterPair(
    tenantId: TenantId,
    assetId: AssetId,
    startValue: number,
    endValue: number,
  ): Promise<void> {
    const metric = (await metricDefinitions.findByKey("energy_export_total"))!;
    await measurements.upsert({
      tenantId,
      subjectType: "ASSET",
      assetId,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId: metric.id,
      timestamp: T1,
      value: startValue,
      quality: "MEASURED",
    });
    await measurements.upsert({
      tenantId,
      subjectType: "ASSET",
      assetId,
      componentId: null,
      measurementPointId: null,
      metricDefinitionId: metric.id,
      timestamp: T3,
      value: endValue,
      quality: "MEASURED",
    });
  }

  it("skips when no Nulleinspeisungs-Konfiguration is set on the GRID_CONNECTION asset", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
    });

    const result = await gridCompliance.computeForDay({
      tenantId: tenant.id,
      gridConnectionAssetId: grid.id,
      day: DAY,
    });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("Keine Nulleinspeisungs-Konfiguration");
    expect(result.config).toBeNull();
  });

  it("computes the daily import minimum and export sum when a configuration is set", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
      configuration: { bufferKw: 10, exportLimitKwh: 15 },
    });

    await importReading(tenant.id, grid.id, T1, 25);
    await importReading(tenant.id, grid.id, T2, 3); // the daily minimum
    await importReading(tenant.id, grid.id, T3, 18);
    await exportCounterPair(tenant.id, grid.id, 100, 140); // 40 kWh Einspeisung

    const result = await gridCompliance.computeForDay({
      tenantId: tenant.id,
      gridConnectionAssetId: grid.id,
      day: DAY,
    });

    expect(result.skipped).toBe(false);
    expect(result.minImportKw).toBeCloseTo(3);
    expect(result.exportKwh).toBeCloseTo(40);
    expect(result.config).toEqual({ bufferKw: 10, exportLimitKwh: 15 });
  });

  it("returns minImportKw=null (not 0) when no active_power_import readings exist in the window", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
      configuration: { bufferKw: 10, exportLimitKwh: 15 },
    });
    await exportCounterPair(tenant.id, grid.id, 0, 0);

    const result = await gridCompliance.computeForDay({
      tenantId: tenant.id,
      gridConnectionAssetId: grid.id,
      day: DAY,
    });

    expect(result.skipped).toBe(false);
    expect(result.minImportKw).toBeNull();
    expect(result.exportKwh).toBeCloseTo(0);
  });
});
