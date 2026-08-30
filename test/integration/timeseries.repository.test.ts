import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import type { Asset } from "../../src/domain/assets/asset.js";
import type { ConnectorId } from "../../src/domain/shared/ids.js";
import type { Tenant } from "../../src/domain/tenancy/tenant.js";
import { ControlIntentIngestionService } from "../../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { AssetStateRepository } from "../../src/infrastructure/repositories/asset-state.repository.js";
import { ControlIntentRepository } from "../../src/infrastructure/repositories/control-intent.repository.js";
import { EventRepository } from "../../src/infrastructure/repositories/event.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("timeseries repositories and ingestion services", () => {
  let db: Db;
  let tenant: Tenant;
  let battery: Asset;
  let measurements: MeasurementRepository;
  let measurementIngestion: MeasurementIngestionService;
  let controlIntents: ControlIntentRepository;
  let controlIntentIngestion: ControlIntentIngestionService;
  let assetStates: AssetStateRepository;
  let events: EventRepository;

  beforeAll(async () => {
    db = await getTestDb();
    measurements = new MeasurementRepository(db);
    controlIntents = new ControlIntentRepository(db);
    assetStates = new AssetStateRepository(db);
    events = new EventRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    measurementIngestion = new MeasurementIngestionService(measurements, metricDefinitions);
    controlIntentIngestion = new ControlIntentIngestionService(controlIntents, metricDefinitions);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  async function setupBattery(): Promise<void> {
    const { tenant: t, site } = await createTenantWithSite(db);
    tenant = t;
    battery = await new AssetRepository(db).insert({
      tenantId: t.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });
  }

  it("ingests a state_of_charge measurement and rejects unknown metric keys", async () => {
    await setupBattery();

    const m = await measurementIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      measurementPointId: null,
      metricKey: "state_of_charge",
      timestamp: new Date("2026-08-30T10:00:00Z"),
      value: 55,
      quality: "MEASURED",
    });
    expect(m.value).toBe(55);

    await expect(
      measurementIngestion.ingest({
        tenantId: tenant.id,
        subjectType: "ASSET",
        assetId: battery.id,
        componentId: null,
        measurementPointId: null,
        metricKey: "not_a_real_metric",
        timestamp: new Date(),
        value: 1,
        quality: "MEASURED",
      }),
    ).rejects.toThrow(/canonical registry/);
  });

  it("rejects a state_of_charge value outside its documented [0,100] bounds", async () => {
    await setupBattery();

    await expect(
      measurementIngestion.ingest({
        tenantId: tenant.id,
        subjectType: "ASSET",
        assetId: battery.id,
        componentId: null,
        measurementPointId: null,
        metricKey: "state_of_charge",
        timestamp: new Date(),
        value: 150,
        quality: "MEASURED",
      }),
    ).rejects.toThrow(/above max/);
  });

  it("upserts a vendor-sourced measurement (last-write-wins on the natural key)", async () => {
    await setupBattery();
    const timestamp = new Date("2026-08-30T10:05:00Z");

    // Repository only forwards this id, no FK on hypertables (ADR-006), so a bare UUID is enough here.
    const connectorId = crypto.randomUUID() as ConnectorId;
    const first = await measurementIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      measurementPointId: null,
      metricKey: "state_of_charge",
      timestamp,
      value: 40,
      quality: "MEASURED",
      connectorId,
      vendorObjectId: "bat.1",
      vendorSensorId: "soc",
    });
    const second = await measurementIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      measurementPointId: null,
      metricKey: "state_of_charge",
      timestamp,
      value: 42,
      quality: "MEASURED",
      connectorId,
      vendorObjectId: "bat.1",
      vendorSensorId: "soc",
    });

    expect(second.id).toBe(first.id);
    expect(second.value).toBe(42);
  });

  it("finds the latest control intent before a given timestamp (ADR-007 query pattern)", async () => {
    await setupBattery();

    await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      metricKey: "active_power_setpoint",
      timestamp: new Date("2026-08-30T10:00:00Z"),
      value: -5,
    });
    await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      metricKey: "active_power_setpoint",
      timestamp: new Date("2026-08-30T10:10:00Z"),
      value: -8,
    });

    const metricDefinitions = new MetricDefinitionRepository(db);
    const setpoint = await metricDefinitions.findByKey("active_power_setpoint");
    const latest = await controlIntents.findLatestBefore(
      tenant.id,
      battery.id,
      setpoint!.id,
      new Date("2026-08-30T10:15:00Z"),
    );
    expect(latest?.value).toBe(-8);

    const before = await controlIntents.findLatestBefore(
      tenant.id,
      battery.id,
      setpoint!.id,
      new Date("2026-08-30T10:05:00Z"),
    );
    expect(before?.value).toBe(-5);
  });

  it("records an availability asset state", async () => {
    await setupBattery();
    const state = await assetStates.insert({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      category: "AVAILABILITY",
      stateValue: "AVAILABLE",
      validFrom: new Date("2026-08-30T00:00:00Z"),
    });
    expect(state.category).toBe("AVAILABILITY");
  });

  it("records an EMS heartbeat event and finds it within a time window", async () => {
    await setupBattery();
    await events.insert({
      tenantId: tenant.id,
      subjectType: "ASSET",
      siteId: null,
      assetId: battery.id,
      componentId: null,
      measurementPointId: null,
      eventType: "EMS_HEARTBEAT",
      occurredAt: new Date("2026-08-30T10:01:00Z"),
      payload: { cpuIdle: 80 },
    });

    const found = await events.existsInWindow(
      tenant.id,
      battery.id,
      "EMS_HEARTBEAT",
      new Date("2026-08-30T10:00:00Z"),
      new Date("2026-08-30T10:02:00Z"),
    );
    expect(found).toBe(true);

    const notFound = await events.existsInWindow(
      tenant.id,
      battery.id,
      "EMS_HEARTBEAT",
      new Date("2026-08-30T11:00:00Z"),
      new Date("2026-08-30T11:02:00Z"),
    );
    expect(notFound).toBe(false);
  });
});
