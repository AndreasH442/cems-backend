import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import type { Anomaly } from "../../src/domain/auditor/anomaly.js";
import type { Asset } from "../../src/domain/assets/asset.js";
import type { AssetId, SiteId, TenantId } from "../../src/domain/shared/ids.js";
import { evaluateMeasurementMissingWithHeartbeat } from "../../src/application/auditor/rules.js";
import { CaseBuilder } from "../../src/application/auditor/case-builder.js";
import {
  batterySetpointTrackingModule,
  pvSetpointVsActualModule,
  type AuditorRuleModule,
} from "../../src/application/auditor/rule-registry.js";
import { CurtailmentService } from "../../src/application/curtailment/curtailment.service.js";
import { GridComplianceService } from "../../src/application/grid-compliance/grid-compliance.service.js";
import { ControlIntentIngestionService } from "../../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import { ManualOperationsService } from "../../src/application/operations/manual-operations.service.js";
import { ActionRepository } from "../../src/infrastructure/repositories/action.repository.js";
import { AnomalyRepository } from "../../src/infrastructure/repositories/anomaly.repository.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { CaseEvidenceRepository } from "../../src/infrastructure/repositories/case-evidence.repository.js";
import { CaseStatusHistoryRepository } from "../../src/infrastructure/repositories/case-status-history.repository.js";
import { CaseSubjectRepository } from "../../src/infrastructure/repositories/case-subject.repository.js";
import { CaseRepository } from "../../src/infrastructure/repositories/case.repository.js";
import { ControlIntentRepository } from "../../src/infrastructure/repositories/control-intent.repository.js";
import { EventRepository } from "../../src/infrastructure/repositories/event.repository.js";
import { MeasurementPointRepository } from "../../src/infrastructure/repositories/measurement-point.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { VerificationRepository } from "../../src/infrastructure/repositories/verification.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

// E2E test #1 ("einfacher SOC-Import") lives in wendeware-mapper.contract.test.ts — it exercises
// the same fixture -> mapping -> measurement path this suite builds on. This file covers the
// remaining five (docs/first-vertical-slice.md): setpoint followed/not followed, action ->
// verification, PV setpoint vs actual, and measurement-missing-with-heartbeat.

/** Shorthand for the ASSET-subject fields every ingest call in this file needs. */
function assetSubject(assetId: AssetId) {
  return { subjectType: "ASSET" as const, assetId, componentId: null };
}

describe("Digital Auditor end-to-end (Anomaly -> Case -> Action -> Verification)", () => {
  let db: Db;
  let assets: AssetRepository;
  let measurements: MeasurementRepository;
  let controlIntents: ControlIntentRepository;
  let events: EventRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let anomalies: AnomalyRepository;
  let measurementIngestion: MeasurementIngestionService;
  let controlIntentIngestion: ControlIntentIngestionService;
  let caseBuilder: CaseBuilder;
  let manualOps: ManualOperationsService;
  let cases: CaseRepository;
  let gridCompliance: GridComplianceService;
  let curtailmentService: CurtailmentService;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    measurements = new MeasurementRepository(db);
    const measurementPoints = new MeasurementPointRepository(db);
    controlIntents = new ControlIntentRepository(db);
    events = new EventRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
    anomalies = new AnomalyRepository(db);
    measurementIngestion = new MeasurementIngestionService(measurements, metricDefinitions);
    controlIntentIngestion = new ControlIntentIngestionService(controlIntents, metricDefinitions);
    // Not exercised by the setpoint-tracking scenarios below — required only because
    // AuditorRuleDeps is one shared shape for every rule module (rule-registry.ts).
    gridCompliance = new GridComplianceService({ assets, measurements, metricDefinitions });
    curtailmentService = new CurtailmentService({
      measurements,
      measurementPoints,
      assets,
      metricDefinitions,
      measurementIngestion,
    });
    cases = new CaseRepository(db);
    caseBuilder = new CaseBuilder({
      cases,
      caseSubjects: new CaseSubjectRepository(db),
      caseEvidence: new CaseEvidenceRepository(db),
      caseStatusHistory: new CaseStatusHistoryRepository(db),
      anomalies,
    });
    manualOps = new ManualOperationsService({
      actions: new ActionRepository(db),
      verifications: new VerificationRepository(db),
      cases,
      caseStatusHistory: new CaseStatusHistoryRepository(db),
    });
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  /**
   * Runner glue for BATTERY_SETPOINT_TRACKING_V1 / PV_SETPOINT_VS_ACTUAL_V1 — calls the real,
   * production rule modules (application/auditor/rule-registry.ts) instead of a parallel
   * reimplementation, so this test exercises the actual Baukasten code path.
   */
  async function runModule(
    module: AuditorRuleModule,
    tenantId: TenantId,
    siteId: SiteId,
    asset: Asset,
  ): Promise<Anomaly | null> {
    const candidate = await module.run(
      { assets, measurements, controlIntents, metricDefinitions, gridCompliance, curtailmentService },
      tenantId,
      asset,
      { now: new Date(), day: new Date() },
    );
    if (!candidate) return null;
    return anomalies.insert({ tenantId, siteId, ...candidate });
  }

  /** Runner glue for MEASUREMENT_MISSING_WITH_HEARTBEAT_V1. */
  async function runMeasurementMissingWithHeartbeat(
    tenantId: TenantId,
    siteId: SiteId,
    assetId: AssetId,
    metricKey: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<Anomaly | null> {
    const metric = await metricDefinitions.findByKey(metricKey);
    const [measurementExists, heartbeatExists] = await Promise.all([
      measurements.findEarliestInWindow(tenantId, assetId, metric!.id, windowStart, windowEnd).then((m) => m !== null),
      events.existsInWindow(tenantId, assetId, "EMS_HEARTBEAT", windowStart, windowEnd),
    ]);
    const candidate = evaluateMeasurementMissingWithHeartbeat({
      assetId,
      metricKey,
      windowStart,
      windowEnd,
      measurementExists,
      heartbeatExists,
    });
    if (!candidate) return null;
    return anomalies.insert({ tenantId, siteId, ...candidate });
  }

  async function setupBattery() {
    const { tenant, site } = await createTenantWithSite(db);
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });
    return { tenant, site, battery };
  }

  it("E2E 2: Setpoint gefolgt -> keine Anomaly", async () => {
    const { tenant, site, battery } = await setupBattery();
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
      value: 0,
      quality: "MEASURED",
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(battery.id),
      measurementPointId: null,
      metricKey: "active_power_discharge",
      timestamp: new Date(t0.getTime() + 10_000),
      value: 5.1,
      quality: "MEASURED",
    });

    const anomaly = await runModule(batterySetpointTrackingModule, tenant.id, site.id, battery);
    expect(anomaly).toBeNull();
  });

  it("E2E 3: Setpoint nicht gefolgt -> Anomaly + Case", async () => {
    const { tenant, site, battery } = await setupBattery();
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

    const anomaly = await runModule(batterySetpointTrackingModule, tenant.id, site.id, battery);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.caseId).toBeNull();

    const kase = await caseBuilder.buildFromAnomalies(tenant.id, site.id, [anomaly!]);
    expect(kase.status).toBe("OPEN");
    expect(kase.severity).toBe("HIGH");

    const attached = await anomalies.findById(tenant.id, anomaly!.id);
    expect(attached?.caseId).toBe(kase.id);
  });

  it("E2E 4: Action -> Verification SUCCESS", async () => {
    const { tenant, site, battery } = await setupBattery();
    const t0 = new Date("2026-08-30T10:00:00Z");

    // Same "not followed" scenario as E2E 3, leading to an anomaly + case.
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
    const anomaly = await runModule(batterySetpointTrackingModule, tenant.id, site.id, battery);
    const kase = await caseBuilder.buildFromAnomalies(tenant.id, site.id, [anomaly!]);

    const action = await manualOps.recordAction(
      tenant.id,
      kase.id,
      "BATTERY_SETPOINT_TRACKING_V1",
      new Date(t0.getTime() + 20_000),
    );
    const inProgress = await cases.findById(tenant.id, kase.id);
    expect(inProgress?.status).toBe("IN_PROGRESS");

    // The corrective action worked: a fresh setpoint is now actually followed.
    const t1 = new Date(t0.getTime() + 30_000);
    await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(battery.id),
      metricKey: "active_power_setpoint",
      timestamp: t1,
      value: -5,
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(battery.id),
      measurementPointId: null,
      metricKey: "active_power_charge",
      timestamp: new Date(t1.getTime() + 10_000),
      value: 0,
      quality: "MEASURED",
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(battery.id),
      measurementPointId: null,
      metricKey: "active_power_discharge",
      timestamp: new Date(t1.getTime() + 10_000),
      value: 5.0,
      quality: "MEASURED",
    });
    const stillFiring = await runModule(batterySetpointTrackingModule, tenant.id, site.id, battery);
    expect(stillFiring).toBeNull();

    const verification = await manualOps.verifyAction(
      tenant.id,
      kase.id,
      action.id,
      stillFiring !== null,
      new Date(t1.getTime() + 20_000),
    );
    expect(verification.result).toBe("SUCCESS");

    const resolved = await cases.findById(tenant.id, kase.id);
    expect(resolved?.status).toBe("RESOLVED");
  });

  it("E2E 5: PV_SETPOINT_VS_ACTUAL_V1 -> Anomaly + Case", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const pvSystem = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "PV_SYSTEM", name: "PV" });
    const inverter = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "PV-Wechselrichter",
      parentAssetId: pvSystem.id,
    });
    const t0 = new Date("2026-08-30T11:00:00Z");

    // Daylight is physically plausible (expected_active_power on the parent PV_SYSTEM), so the
    // gate added after the real-pilot nighttime-floor false-positive finding (02.09.2026,
    // isGenerationPhysicallyPlausible) does not suppress this scenario.
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(pvSystem.id),
      measurementPointId: null,
      metricKey: "expected_active_power",
      timestamp: new Date(t0.getTime() + 5_000),
      value: 12,
      quality: "CALCULATED",
    });
    // Curtailment setpoint of 10 kW, but the inverter keeps producing 15 kW.
    await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(inverter.id),
      metricKey: "active_power_setpoint",
      timestamp: t0,
      value: 10,
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(inverter.id),
      measurementPointId: null,
      metricKey: "active_power_generation",
      timestamp: new Date(t0.getTime() + 10_000),
      value: 15,
      quality: "MEASURED",
    });

    const anomaly = await runModule(pvSetpointVsActualModule, tenant.id, site.id, inverter);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.ruleKey).toBe("PV_SETPOINT_VS_ACTUAL_V1");

    const kase = await caseBuilder.buildFromAnomalies(tenant.id, site.id, [anomaly!]);
    expect(kase.severity).toBe("MEDIUM");
  });

  it("E2E 5b: PV_SETPOINT_VS_ACTUAL_V1 does not fire at night (expected_active_power ~0) — real-pilot false-positive fix", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const pvSystem = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "PV_SYSTEM", name: "PV" });
    const inverter = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "PV-Wechselrichter",
      parentAssetId: pvSystem.id,
    });
    const t0 = new Date("2026-08-30T23:00:00Z"); // night

    // Vendor holds a frozen idle setpoint overnight (real observed value, docs/data-requirements.md).
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(pvSystem.id),
      measurementPointId: null,
      metricKey: "expected_active_power",
      timestamp: new Date(t0.getTime() + 5_000),
      value: 0,
      quality: "CALCULATED",
    });
    await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(inverter.id),
      metricKey: "active_power_setpoint",
      timestamp: t0,
      value: 5.5,
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      ...assetSubject(inverter.id),
      measurementPointId: null,
      metricKey: "active_power_generation",
      timestamp: new Date(t0.getTime() + 10_000),
      value: 0,
      quality: "MEASURED",
    });

    const anomaly = await runModule(pvSetpointVsActualModule, tenant.id, site.id, inverter);
    expect(anomaly).toBeNull();
  });

  it("E2E 6: MEASUREMENT_MISSING_WITH_HEARTBEAT_V1 -> Anomaly nur mit Heartbeat", async () => {
    const { tenant, site, battery } = await setupBattery();
    const windowStart = new Date("2026-08-30T12:00:00Z");
    const windowEnd = new Date("2026-08-30T12:05:00Z");

    // No device_temperature measurement in the window at all in this test.
    await events.insert({
      tenantId: tenant.id,
      subjectType: "ASSET",
      siteId: null,
      assetId: battery.id,
      componentId: null,
      measurementPointId: null,
      eventType: "EMS_HEARTBEAT",
      occurredAt: new Date(windowStart.getTime() + 60_000),
      payload: {},
    });

    const anomaly = await runMeasurementMissingWithHeartbeat(
      tenant.id,
      site.id,
      battery.id,
      "device_temperature",
      windowStart,
      windowEnd,
    );
    expect(anomaly).not.toBeNull();
    expect(anomaly!.ruleKey).toBe("MEASUREMENT_MISSING_WITH_HEARTBEAT_V1");

    const kase = await caseBuilder.buildFromAnomalies(tenant.id, site.id, [anomaly!]);
    expect(kase.status).toBe("OPEN");
  });

  it("E2E 6b: kein Heartbeat -> Gesamtausfall statt Anomaly (Gegenprobe)", async () => {
    const { tenant, site, battery } = await setupBattery();
    const windowStart = new Date("2026-08-30T13:00:00Z");
    const windowEnd = new Date("2026-08-30T13:05:00Z");

    const anomaly = await runMeasurementMissingWithHeartbeat(
      tenant.id,
      site.id,
      battery.id,
      "device_temperature",
      windowStart,
      windowEnd,
    );
    expect(anomaly).toBeNull();
  });
});
