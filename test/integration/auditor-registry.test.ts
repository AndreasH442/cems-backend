import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { CaseBuilder } from "../../src/application/auditor/case-builder.js";
import { runAuditorForTenant } from "../../src/application/auditor/rule-registry.js";
import { CurtailmentService } from "../../src/application/curtailment/curtailment.service.js";
import { GridComplianceService } from "../../src/application/grid-compliance/grid-compliance.service.js";
import { ControlIntentIngestionService } from "../../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import type { AssetId, TenantId } from "../../src/domain/shared/ids.js";
import { AnomalyRepository } from "../../src/infrastructure/repositories/anomaly.repository.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { CaseEvidenceRepository } from "../../src/infrastructure/repositories/case-evidence.repository.js";
import { CaseStatusHistoryRepository } from "../../src/infrastructure/repositories/case-status-history.repository.js";
import { CaseSubjectRepository } from "../../src/infrastructure/repositories/case-subject.repository.js";
import { CaseRepository } from "../../src/infrastructure/repositories/case.repository.js";
import { ControlIntentRepository } from "../../src/infrastructure/repositories/control-intent.repository.js";
import { MeasurementPointRepository } from "../../src/infrastructure/repositories/measurement-point.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

const DAY = new Date("2026-08-31T00:00:00Z");
const T1 = new Date("2026-08-31T08:00:00Z");
const T2 = new Date("2026-08-31T12:00:00Z");
const T3 = new Date("2026-08-31T16:00:00Z");

function assetSubject(assetId: AssetId) {
  return { subjectType: "ASSET" as const, assetId, componentId: null };
}

describe("runAuditorForTenant (Baukasten registry, real DB)", () => {
  let db: Db;
  let assets: AssetRepository;
  let measurements: MeasurementRepository;
  let controlIntents: ControlIntentRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let anomalies: AnomalyRepository;
  let measurementIngestion: MeasurementIngestionService;
  let controlIntentIngestion: ControlIntentIngestionService;
  let gridCompliance: GridComplianceService;
  let curtailmentService: CurtailmentService;
  let caseBuilder: CaseBuilder;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    measurements = new MeasurementRepository(db);
    const measurementPoints = new MeasurementPointRepository(db);
    controlIntents = new ControlIntentRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
    anomalies = new AnomalyRepository(db);
    measurementIngestion = new MeasurementIngestionService(measurements, metricDefinitions);
    controlIntentIngestion = new ControlIntentIngestionService(controlIntents, metricDefinitions);
    gridCompliance = new GridComplianceService({ assets, measurements, metricDefinitions });
    curtailmentService = new CurtailmentService({
      measurements,
      measurementPoints,
      assets,
      metricDefinitions,
      measurementIngestion,
    });
    caseBuilder = new CaseBuilder({
      cases: new CaseRepository(db),
      caseSubjects: new CaseSubjectRepository(db),
      caseEvidence: new CaseEvidenceRepository(db),
      caseStatusHistory: new CaseStatusHistoryRepository(db),
      anomalies,
    });
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  function deps() {
    return {
      assets,
      measurements,
      controlIntents,
      metricDefinitions,
      gridCompliance,
      curtailmentService,
      anomalies,
      caseBuilder,
    };
  }

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
    await counterPair(tenantId, assetId, "energy_export_total", startValue, endValue);
  }

  async function counterPair(
    tenantId: TenantId,
    assetId: AssetId,
    metricKey: string,
    startValue: number,
    endValue: number,
  ): Promise<void> {
    const metric = (await metricDefinitions.findByKey(metricKey))!;
    for (const [timestamp, value] of [
      [T1, startValue],
      [T3, endValue],
    ] as const) {
      await measurements.upsert({
        tenantId,
        subjectType: "ASSET",
        assetId,
        componentId: null,
        measurementPointId: null,
        metricDefinitionId: metric.id,
        timestamp,
        value,
        quality: "MEASURED",
      });
    }
  }

  async function expectedPowerPair(tenantId: TenantId, assetId: AssetId, kw1: number, kw2: number): Promise<void> {
    const metric = (await metricDefinitions.findByKey("expected_active_power"))!;
    const t1 = new Date("2026-08-31T09:00:00Z");
    const t2 = new Date("2026-08-31T10:00:00Z"); // 1h apart -> trapezoidal integration is straightforward to reason about
    for (const [timestamp, value] of [
      [t1, kw1],
      [t2, kw2],
    ] as const) {
      await measurements.upsert({
        tenantId,
        subjectType: "ASSET",
        assetId,
        componentId: null,
        measurementPointId: null,
        metricDefinitionId: metric.id,
        timestamp,
        value,
        quality: "CALCULATED",
      });
    }
  }

  it("auto-discovers assets by type — no asset ID passed in, a firing battery rule is still found", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "B1",
    });
    const t0 = new Date("2026-08-30T10:00:00Z");
    await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(battery.id),
      metricKey: "active_power_setpoint",
      timestamp: t0,
      value: -5,
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(battery.id),
      measurementPointId: null,
      metricKey: "active_power_charge",
      timestamp: new Date(t0.getTime() + 10_000),
      value: 4,
      quality: "MEASURED",
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(battery.id),
      measurementPointId: null,
      metricKey: "active_power_discharge",
      timestamp: new Date(t0.getTime() + 10_000),
      value: 0,
      quality: "MEASURED",
    });

    const results = await runAuditorForTenant(deps(), tenant.id, { now: new Date(), day: DAY });

    expect(results).toHaveLength(1);
    expect(results[0]!.asset.id).toBe(battery.id);
    expect(results[0]!.anomalies).toHaveLength(1);
    expect(results[0]!.anomalies[0]!.ruleKey).toBe("BATTERY_SETPOINT_TRACKING_V1");
    expect(results[0]!.caseId).toBeTruthy();
  });

  it("bundles multiple firing rules on the same asset into exactly one Case", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
      configuration: { bufferKw: 10, exportLimitKwh: 15 },
    });
    // Both grid rules fire: import dips below the buffer, and export exceeds the limit.
    await importReading(tenant.id, grid.id, T1, 25);
    await importReading(tenant.id, grid.id, T2, 3);
    await importReading(tenant.id, grid.id, T3, 18);
    await exportCounterPair(tenant.id, grid.id, 100, 140);

    const results = await runAuditorForTenant(deps(), tenant.id, { now: new Date(), day: DAY });

    expect(results).toHaveLength(1);
    expect(results[0]!.asset.id).toBe(grid.id);
    const ruleKeys = results[0]!.anomalies.map((a) => a.ruleKey).sort();
    expect(ruleKeys).toEqual(["GRID_EXPORT_LIMIT_EXCEEDED_V1", "GRID_IMPORT_BUFFER_UNDERSHOOT_V1"]);
    // One Case, not two — all of this asset's rule hits bundled together.
    const caseIds = new Set(results.map((r) => r.caseId));
    expect(caseIds.size).toBe(1);
  });

  it("produces no result for an asset with no firing rule", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "BATTERY_SYSTEM", name: "B1" });
    // No ControlIntent at all -> BATTERY_SETPOINT_TRACKING_V1 has nothing to compare against.
    await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
      // No Nulleinspeisungs-Konfiguration -> both grid rules are skipped for this asset.
    });
    await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_SYSTEM",
      name: "PV",
      // No curtailment-scope configuration -> PV_GENERATION_VS_WEATHER_V1 is skipped, not guessed.
    });

    const results = await runAuditorForTenant(deps(), tenant.id, { now: new Date(), day: DAY });

    expect(results).toHaveLength(0);
  });

  it("auto-discovers a PV_SYSTEM with a curtailment-scope configuration and fires PV_GENERATION_VS_WEATHER_V1", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const grid = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netz",
    });
    const load = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "LOAD", name: "Verbrauch" });
    const pv = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_SYSTEM",
      name: "PV",
      configuration: { gridConnectionAssetId: grid.id, userConsumptionAssetId: load.id },
    });

    await counterPair(tenant.id, pv.id, "energy_generation_total", 0, 40); // actual = 40 kWh
    await expectedPowerPair(tenant.id, pv.id, 100, 100); // flat 100 kW over 1h -> 100 kWh expected
    await counterPair(tenant.id, load.id, "energy_consumption_total", 0, 200); // verbrauch = 200 kWh
    await exportCounterPair(tenant.id, grid.id, 0, 0);
    // max_usable = min(100, 200) = 100; regelungsGap = 100 - 40 = 60 kWh, clearly above the threshold.

    const results = await runAuditorForTenant(deps(), tenant.id, { now: new Date(), day: DAY });

    expect(results).toHaveLength(1);
    expect(results[0]!.asset.id).toBe(pv.id);
    expect(results[0]!.anomalies).toHaveLength(1);
    expect(results[0]!.anomalies[0]!.ruleKey).toBe("PV_GENERATION_VS_WEATHER_V1");
  });
});
