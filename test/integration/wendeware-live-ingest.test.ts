import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { ControlIntentIngestionService } from "../../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import { WendewareLiveIngestService } from "../../src/connectors/wendeware/live-ingest.service.js";
import { WendewareMapper } from "../../src/connectors/wendeware/mapper.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../../src/infrastructure/repositories/connector.repository.js";
import { ControlIntentRepository } from "../../src/infrastructure/repositories/control-intent.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { VendorMetricMappingRepository } from "../../src/infrastructure/repositories/vendor-metric-mapping.repository.js";
import { VendorObjectMappingRepository } from "../../src/infrastructure/repositories/vendor-object-mapping.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

const CLIENT_ID_VAR = "TEST_LIVE_MPG_CLIENT_ID";
const CLIENT_SECRET_VAR = "TEST_LIVE_MPG_CLIENT_SECRET";

/**
 * Synthetic myPowerGrid JSON:API responses, shaped like the confirmed structure in
 * docs/data-requirements.md — no real customer data, no real network calls, no real credentials.
 */
function mockFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;

  if (href.includes("openid-connect/token")) {
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "fake-token", expires_in: 300, token_type: "Bearer" }), {
        status: 200,
      }),
    );
  }
  if (href.includes("/energy_management_systems")) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: [{ id: "ems-1", type: "energy_management_systems", attributes: { name: "Test EMS" } }],
        }),
        { status: 200 },
      ),
    );
  }
  if (href.includes("/sensors/measurements/seqs/")) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: {
            attributes: {
              datetimes: ["2026-09-01T10:00:00Z"],
              "sensor-soc": [55.3],
            },
          },
        }),
        { status: 200 },
      ),
    );
  }
  if (href.includes("/sensors")) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "sensor-soc",
              type: "sensors",
              attributes: { label: "State of Charge", unit: "%" },
              relationships: { device: { data: { id: "device-1", type: "devices" } } },
            },
          ],
        }),
        { status: 200 },
      ),
    );
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

describe("WendewareLiveIngestService (fetch mocked, real DB)", () => {
  let db: Db;
  let assets: AssetRepository;
  let connectors: ConnectorRepository;
  let objectMappings: VendorObjectMappingRepository;
  let metricMappings: VendorMetricMappingRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let liveIngest: WendewareLiveIngestService;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    connectors = new ConnectorRepository(db);
    objectMappings = new VendorObjectMappingRepository(db);
    metricMappings = new VendorMetricMappingRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);

    const measurements = new MeasurementRepository(db);
    const controlIntents = new ControlIntentRepository(db);
    const mapper = new WendewareMapper({
      vendorObjectMappings: objectMappings,
      vendorMetricMappings: metricMappings,
      metricDefinitions,
      measurementIngestion: new MeasurementIngestionService(measurements, metricDefinitions),
      controlIntentIngestion: new ControlIntentIngestionService(controlIntents, metricDefinitions),
    });
    liveIngest = new WendewareLiveIngestService({ connectors, mapper });
  });

  beforeEach(() => {
    process.env[CLIENT_ID_VAR] = "fake-client-id";
    process.env[CLIENT_SECRET_VAR] = "fake-client-secret";
    vi.stubGlobal("fetch", vi.fn(mockFetch));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env[CLIENT_ID_VAR];
    delete process.env[CLIENT_SECRET_VAR];
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("discovers the device as DISCOVERED on first pull (no mapping yet)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Live Connector",
      secretReference: `env:${CLIENT_ID_VAR},env:${CLIENT_SECRET_VAR}`,
      siteId: site.id,
    });

    const result = await liveIngest.pull(tenant.id, connector.id);

    expect(result.emsCount).toBe(1);
    expect(result.sensorCount).toBe(1);
    expect(result.mapResult.discovered.map((d) => d.vendorObjectId)).toEqual(["device-1"]);
    expect(result.mapResult.measurementsIngested).toBe(0);
  });

  it("ingests a real Measurement once the device/sensor are mapped", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Live Connector",
      secretReference: `env:${CLIENT_ID_VAR},env:${CLIENT_SECRET_VAR}`,
      siteId: site.id,
    });

    const discovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "device-1",
    });
    const mapped = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: discovered.id,
      targetAssetId: battery.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const soc = await metricDefinitions.findByKey("state_of_charge");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: mapped.id,
      vendorSensorId: "sensor-soc",
      metricDefinitionId: soc!.id,
    });

    const result = await liveIngest.pull(tenant.id, connector.id);

    expect(result.mapResult.measurementsIngested).toBe(1);
    const row = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", battery.id)
      .executeTakeFirst();
    expect(row?.value).toBe(55.3);
  });
});
