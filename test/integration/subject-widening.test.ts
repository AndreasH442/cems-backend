import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { ControlIntentIngestionService } from "../../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import { WendewareMapper } from "../../src/connectors/wendeware/mapper.js";
import type { WendewareFixture } from "../../src/connectors/wendeware/types.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { AssetStateRepository } from "../../src/infrastructure/repositories/asset-state.repository.js";
import { ComponentRepository } from "../../src/infrastructure/repositories/component.repository.js";
import { ConnectorRepository } from "../../src/infrastructure/repositories/connector.repository.js";
import { ControlIntentRepository } from "../../src/infrastructure/repositories/control-intent.repository.js";
import { EventRepository } from "../../src/infrastructure/repositories/event.repository.js";
import { MeasurementPointRepository } from "../../src/infrastructure/repositories/measurement-point.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { VendorMetricMappingRepository } from "../../src/infrastructure/repositories/vendor-metric-mapping.repository.js";
import { VendorObjectMappingRepository } from "../../src/infrastructure/repositories/vendor-object-mapping.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("Component / MeasurementPoint as Measurement/ControlIntent/AssetState/Event/VendorObjectMapping subjects", () => {
  let db: Db;
  let assets: AssetRepository;
  let components: ComponentRepository;
  let measurementPoints: MeasurementPointRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let measurements: MeasurementRepository;
  let controlIntents: ControlIntentRepository;
  let measurementIngestion: MeasurementIngestionService;
  let controlIntentIngestion: ControlIntentIngestionService;
  let assetStates: AssetStateRepository;
  let events: EventRepository;
  let objectMappings: VendorObjectMappingRepository;
  let metricMappings: VendorMetricMappingRepository;
  let connectors: ConnectorRepository;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    components = new ComponentRepository(db);
    measurementPoints = new MeasurementPointRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
    measurements = new MeasurementRepository(db);
    controlIntents = new ControlIntentRepository(db);
    measurementIngestion = new MeasurementIngestionService(measurements, metricDefinitions);
    controlIntentIngestion = new ControlIntentIngestionService(controlIntents, metricDefinitions);
    assetStates = new AssetStateRepository(db);
    events = new EventRepository(db);
    objectMappings = new VendorObjectMappingRepository(db);
    metricMappings = new VendorMetricMappingRepository(db);
    connectors = new ConnectorRepository(db);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("ingests a measurement against a Component subject", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const inverter = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "PV-Wechselrichter",
    });
    const mppt = await components.insert({
      tenantId: tenant.id,
      assetId: inverter.id,
      componentType: "MPPT",
      name: "MPPT 1",
    });

    const m = await measurementIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "COMPONENT",
      assetId: null,
      componentId: mppt.id,
      measurementPointId: null,
      metricKey: "device_temperature",
      timestamp: new Date("2026-08-30T10:00:00Z"),
      value: 32,
      quality: "MEASURED",
    });
    expect(m.subjectType).toBe("COMPONENT");
    if (m.subjectType === "COMPONENT") {
      expect(m.componentId).toBe(mppt.id);
    }
  });

  it("ingests a measurement against a MeasurementPoint subject (LP-AC-01)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-01" });

    const m = await measurementIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "MEASUREMENT_POINT",
      assetId: null,
      componentId: null,
      measurementPointId: mp.id,
      metricKey: "active_power_generation",
      timestamp: new Date("2026-08-30T10:00:00Z"),
      value: 7.5,
      quality: "MEASURED",
    });
    expect(m.subjectType).toBe("MEASUREMENT_POINT");
    if (m.subjectType === "MEASUREMENT_POINT") {
      expect(m.measurementPointId).toBe(mp.id);
    }
  });

  it("ingests a control intent against a Component subject", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie",
    });
    const rack = await components.insert({
      tenantId: tenant.id,
      assetId: battery.id,
      componentType: "BATTERY_RACK",
      name: "Rack 1",
    });

    const ci = await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "COMPONENT",
      assetId: null,
      componentId: rack.id,
      metricKey: "active_power_setpoint",
      timestamp: new Date("2026-08-30T10:00:00Z"),
      value: -2,
    });
    expect(ci.subjectType).toBe("COMPONENT");
  });

  it("records an asset state against a Component subject", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const asset = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "GENERIC_DEVICE", name: "x" });
    const component = await components.insert({
      tenantId: tenant.id,
      assetId: asset.id,
      componentType: "VENDOR_COMPONENT",
      name: "c1",
    });

    const state = await assetStates.insert({
      tenantId: tenant.id,
      subjectType: "COMPONENT",
      assetId: null,
      componentId: component.id,
      category: "HEALTH",
      stateValue: "OK",
      validFrom: new Date("2026-08-30T00:00:00Z"),
    });
    expect(state.subjectType).toBe("COMPONENT");
  });

  it("records an event against a MeasurementPoint subject", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-02" });

    const event = await events.insert({
      tenantId: tenant.id,
      subjectType: "MEASUREMENT_POINT",
      siteId: null,
      assetId: null,
      componentId: null,
      measurementPointId: mp.id,
      eventType: "DEVICE_FAULT",
      occurredAt: new Date("2026-08-30T10:00:00Z"),
    });
    expect(event.subjectType).toBe("MEASUREMENT_POINT");
  });

  it("maps a vendor object to a MeasurementPoint (VendorObjectMapping target widening)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-03" });
    const discovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "prc.lp-ac-03",
    });

    const mapped = await objectMappings.mapToMeasurementPoint({
      tenantId: tenant.id,
      id: discovered.id,
      targetMeasurementPointId: mp.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    expect(mapped.targetType).toBe("MEASUREMENT_POINT");
    expect(mapped.targetMeasurementPointId).toBe(mp.id);
  });

  it("end-to-end: Wendeware fixture -> VendorObjectMapping(MeasurementPoint) -> Measurement (LP-AC-01)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-01" });

    const discovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "prc.lp-ac-01",
    });
    const mapped = await objectMappings.mapToMeasurementPoint({
      tenantId: tenant.id,
      id: discovered.id,
      targetMeasurementPointId: mp.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const generation = await metricDefinitions.findByKey("active_power_generation");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: mapped.id,
      vendorSensorId: "p_ac",
      metricDefinitionId: generation!.id,
    });

    const mapper = new WendewareMapper({
      vendorObjectMappings: objectMappings,
      vendorMetricMappings: metricMappings,
      metricDefinitions,
      measurementIngestion,
      controlIntentIngestion,
    });

    const fixture: WendewareFixture = {
      objects: [
        {
          objectId: "prc.lp-ac-01",
          sensors: [{ sensorId: "p_ac", value: 6.2, timestamp: "2026-08-30T10:00:00.000Z" }],
        },
      ],
    };

    const result = await mapper.mapAndIngest(tenant.id, connector.id, fixture);
    expect(result.measurementsIngested).toBe(1);

    const row = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("measurement_point_id", "=", mp.id)
      .executeTakeFirst();
    expect(row?.value).toBe(6.2);
  });

  it("rejects mapping a control-intent-typed sensor to a MeasurementPoint target", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-04" });
    const discovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "prc.lp-ac-04",
    });
    const mapped = await objectMappings.mapToMeasurementPoint({
      tenantId: tenant.id,
      id: discovered.id,
      targetMeasurementPointId: mp.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const setpoint = await metricDefinitions.findByKey("active_power_setpoint");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: mapped.id,
      vendorSensorId: "p_setpoint",
      metricDefinitionId: setpoint!.id,
    });

    const mapper = new WendewareMapper({
      vendorObjectMappings: objectMappings,
      vendorMetricMappings: metricMappings,
      metricDefinitions,
      measurementIngestion,
      controlIntentIngestion,
    });

    const fixture: WendewareFixture = {
      objects: [
        {
          objectId: "prc.lp-ac-04",
          sensors: [{ sensorId: "p_setpoint", value: 5, timestamp: "2026-08-30T10:00:00.000Z" }],
        },
      ],
    };

    await expect(mapper.mapAndIngest(tenant.id, connector.id, fixture)).rejects.toThrow(/not steuerbar/);
  });
});
