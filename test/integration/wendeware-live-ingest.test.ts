import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { ControlIntentIngestionService } from "../../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import { encodeVendorSensorId } from "../../src/connectors/wendeware/live-client.js";
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
 * One counter sensor ("sensor-pv" on "device-1", category pv_meter_supply) and one gauge sensor
 * ("sensor-soc" on "device-2", category battery_soc) — mirrors the real "one sensor, multiple
 * series types" shape confirmed against the real API.
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
  if (href.includes("/sensors/measurements/seqs/energy_mm_counter_seqs")) {
    return Promise.resolve(
      jsonResponse({ data: { attributes: { datetimes: ["2026-09-01T10:00:00Z"], "sensor-pv": [31_800_000] } } }),
    );
  }
  if (href.includes("/sensors/measurements/seqs/power_mm_counter_seqs")) {
    return Promise.resolve(
      jsonResponse({ data: { attributes: { datetimes: ["2026-09-01T10:00:00Z"], "sensor-pv": [15_619.58] } } }),
    );
  }
  if (href.includes("/sensors/measurements/seqs/avg_mm_gauge_seqs")) {
    return Promise.resolve(
      jsonResponse({ data: { attributes: { datetimes: ["2026-09-01T10:00:00Z"], "sensor-soc": [55.3] } } }),
    );
  }
  if (href.includes("/sensors") && href.includes("filter%5Bsensor_type%5D%5Btype_id%5D=pv_meter_supply")) {
    return Promise.resolve(
      jsonResponse({
        data: [
          {
            id: "sensor-pv",
            type: "sensors",
            attributes: { label: "PV-WR 1", unit: "Wh" },
            relationships: { device: { data: { id: "device-1", type: "devices" } } },
          },
        ],
      }),
    );
  }
  if (href.includes("/sensors") && href.includes("filter%5Bsensor_type%5D%5Btype_id%5D=battery_soc")) {
    return Promise.resolve(
      jsonResponse({
        data: [
          {
            id: "sensor-soc",
            type: "sensors",
            attributes: { label: "State of Charge", unit: "%" },
            relationships: { device: { data: { id: "device-2", type: "devices" } } },
          },
        ],
      }),
    );
  }
  if (href.includes("/sensors")) {
    // Every other confirmed category (docs/data-requirements.md) — none present in this fixture.
    return Promise.resolve(jsonResponse({ data: [] }));
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
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

  it("discovers both devices as DISCOVERED on first pull (no mapping yet)", async () => {
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
    expect(result.sensorCount).toBe(2);
    expect(result.mapResult.discovered.map((d) => d.vendorObjectId).sort()).toEqual(["device-1", "device-2"]);
    expect(result.mapResult.measurementsIngested).toBe(0);
  });

  it("ingests both a counter sensor's two series (total + derived power) and a gauge sensor once mapped", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const inverter = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "PV-Wechselrichter 1",
    });
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

    const pvDiscovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "device-1",
    });
    const pvMapped = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: pvDiscovered.id,
      targetAssetId: inverter.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const generationTotal = await metricDefinitions.findByKey("energy_generation_total");
    const generationPower = await metricDefinitions.findByKey("active_power_generation");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: pvMapped.id,
      vendorSensorId: encodeVendorSensorId("sensor-pv", "energy_mm_counter_seqs"),
      metricDefinitionId: generationTotal!.id,
      unitFactor: 0.001,
    });
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: pvMapped.id,
      vendorSensorId: encodeVendorSensorId("sensor-pv", "power_mm_counter_seqs"),
      metricDefinitionId: generationPower!.id,
      unitFactor: 0.001,
    });

    const socDiscovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "device-2",
    });
    const socMapped = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: socDiscovered.id,
      targetAssetId: battery.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const soc = await metricDefinitions.findByKey("state_of_charge");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: socMapped.id,
      vendorSensorId: encodeVendorSensorId("sensor-soc", "avg_mm_gauge_seqs"),
      metricDefinitionId: soc!.id,
    });

    const result = await liveIngest.pull(tenant.id, connector.id);

    expect(result.mapResult.measurementsIngested).toBe(3);

    const pvRows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", inverter.id)
      .execute();
    expect(pvRows).toHaveLength(2);
    const values = pvRows.map((r) => r.value).sort((a, b) => a - b);
    expect(values[0]).toBeCloseTo(15.61958);
    expect(values[1]).toBe(31800);

    const socRow = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", battery.id)
      .executeTakeFirst();
    expect(socRow?.value).toBe(55.3);
  });
});
