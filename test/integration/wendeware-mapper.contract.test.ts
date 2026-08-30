import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { ControlIntentIngestionService } from "../../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import { WendewareMapper } from "../../src/connectors/wendeware/mapper.js";
import type { WendewareFixture } from "../../src/connectors/wendeware/types.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../../src/infrastructure/repositories/connector.repository.js";
import { ControlIntentRepository } from "../../src/infrastructure/repositories/control-intent.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { VendorMetricMappingRepository } from "../../src/infrastructure/repositories/vendor-metric-mapping.repository.js";
import { VendorObjectMappingRepository } from "../../src/infrastructure/repositories/vendor-object-mapping.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/connectors/wendeware/fixtures/site-1-snapshot.json",
);

function loadFixture(): WendewareFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as WendewareFixture;
}

describe("WendewareMapper (fixture-based, contract test for SOC-Sensor-Zuordnung)", () => {
  let db: Db;
  let objectMappings: VendorObjectMappingRepository;
  let metricMappings: VendorMetricMappingRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let mapper: WendewareMapper;
  let measurements: MeasurementRepository;
  let controlIntents: ControlIntentRepository;

  beforeAll(async () => {
    db = await getTestDb();
    objectMappings = new VendorObjectMappingRepository(db);
    metricMappings = new VendorMetricMappingRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
    measurements = new MeasurementRepository(db);
    controlIntents = new ControlIntentRepository(db);
    mapper = new WendewareMapper({
      vendorObjectMappings: objectMappings,
      vendorMetricMappings: metricMappings,
      metricDefinitions,
      measurementIngestion: new MeasurementIngestionService(measurements, metricDefinitions),
      controlIntentIngestion: new ControlIntentIngestionService(controlIntents, metricDefinitions),
    });
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("discovers unmapped vendor objects as DISCOVERED and ingests nothing for them", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await new ConnectorRepository(db).insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Site Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });

    const result = await mapper.mapAndIngest(tenant.id, connector.id, loadFixture());

    // bat.1, inv.1, prc.7 are all unknown on first run.
    expect(result.discovered.map((d) => d.vendorObjectId).sort()).toEqual(["bat.1", "inv.1", "prc.7"]);
    expect(result.discovered.every((d) => d.mappingStatus === "DISCOVERED")).toBe(true);
    expect(result.measurementsIngested).toBe(0);
    expect(result.controlIntentsIngested).toBe(0);
    expect(result.skippedSensors).toBeGreaterThan(0);
  });

  it("imports state_of_charge once bat.1/soc is mapped to a battery asset (einfacher SOC-Import)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await new ConnectorRepository(db).insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Site Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });
    const battery = await new AssetRepository(db).insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });

    const batteryObject = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "bat.1",
    });
    const mappedBattery = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: batteryObject.id,
      targetAssetId: battery.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const soc = await metricDefinitions.findByKey("state_of_charge");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: mappedBattery.id,
      vendorSensorId: "soc",
      metricDefinitionId: soc!.id,
    });

    const result = await mapper.mapAndIngest(tenant.id, connector.id, loadFixture());

    expect(result.measurementsIngested).toBe(1);
    expect(result.controlIntentsIngested).toBe(0);
    // p_setpoint/p_charge/p_discharge on bat.1 and everything on inv.1/prc.7 stay unmapped this run.
    expect(result.skippedSensors).toBeGreaterThan(0);
  });
});
