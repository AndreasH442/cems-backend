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
import { MeasurementPointRepository } from "../../src/infrastructure/repositories/measurement-point.repository.js";
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
 * One counter sensor ("sensor-pv" on "device-1", category pv_meter_supply), one gauge sensor
 * ("sensor-soc" on "device-2", category battery_soc), and one wallbox counter sensor ("sensor-lp"
 * on "device-3", category wallbox_meter_demand — the confirmed real-world shape is a MeasurementPoint
 * like "LP-AC-01", not a distinct charging-station asset, docs/data-requirements.md) — mirrors the
 * real "one sensor, multiple series types" shape confirmed against the real API.
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
      jsonResponse({
        data: {
          attributes: {
            datetimes: ["2026-09-01T10:00:00Z"],
            "sensor-pv": [31_800_000],
            "sensor-lp": [5_000_000],
          },
        },
      }),
    );
  }
  if (href.includes("/sensors/measurements/seqs/power_mm_counter_seqs")) {
    return Promise.resolve(
      jsonResponse({
        data: {
          attributes: {
            datetimes: ["2026-09-01T10:00:00Z"],
            "sensor-pv": [15_619.58],
            "sensor-lp": [3_000],
          },
        },
      }),
    );
  }
  if (href.includes("/sensors/measurements/seqs/avg_mm_gauge_seqs")) {
    return Promise.resolve(
      jsonResponse({
        data: {
          attributes: {
            datetimes: ["2026-09-01T10:00:00Z"],
            "sensor-soc": [55.3],
            "sensor-dcv": [742.5],
            "sensor-price": [6.18],
          },
        },
      }),
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
  if (href.includes("/sensors") && href.includes("filter%5Bsensor_type%5D%5Btype_id%5D=battery_dc_voltage")) {
    return Promise.resolve(
      jsonResponse({
        data: [
          {
            id: "sensor-dcv",
            type: "sensors",
            attributes: { label: "DC Voltage", unit: "V" },
            relationships: { device: { data: { id: "device-2", type: "devices" } } },
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
  if (href.includes("/sensors") && href.includes("filter%5Bsensor_type%5D%5Btype_id%5D=wallbox_meter_demand")) {
    return Promise.resolve(
      jsonResponse({
        data: [
          {
            id: "sensor-lp",
            type: "sensors",
            attributes: { label: "LP-AC-01", unit: "Wh" },
            relationships: { device: { data: { id: "device-3", type: "devices" } } },
          },
        ],
      }),
    );
  }
  if (
    href.includes("/sensors") &&
    href.includes("filter%5Bsensor_type%5D%5Btype_id%5D=grid_processed_price_eurocent")
  ) {
    return Promise.resolve(
      jsonResponse({
        data: [
          {
            id: "sensor-price",
            type: "sensors",
            attributes: { label: "Grid", unit: "€-ct" },
            relationships: { device: { data: { id: "device-4", type: "devices" } } },
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
  let measurementPoints: MeasurementPointRepository;
  let connectors: ConnectorRepository;
  let objectMappings: VendorObjectMappingRepository;
  let metricMappings: VendorMetricMappingRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let liveIngest: WendewareLiveIngestService;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    measurementPoints = new MeasurementPointRepository(db);
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

  it("discovers all four devices as DISCOVERED on first pull (no mapping yet)", async () => {
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
    expect(result.sensorCount).toBe(5);
    expect(result.mapResult.discovered.map((d) => d.vendorObjectId).sort()).toEqual([
      "device-1",
      "device-2",
      "device-3",
      "device-4",
    ]);
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
    const dcVoltage = await metricDefinitions.findByKey("dc_voltage");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: socMapped.id,
      vendorSensorId: encodeVendorSensorId("sensor-dcv", "avg_mm_gauge_seqs"),
      metricDefinitionId: dcVoltage!.id,
    });

    const result = await liveIngest.pull(tenant.id, connector.id);

    expect(result.mapResult.measurementsIngested).toBe(4);

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

    const batteryRows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", battery.id)
      .execute();
    expect(batteryRows).toHaveLength(2);
    const batteryValues = batteryRows.map((r) => r.value).sort((a, b) => a - b);
    expect(batteryValues).toEqual([55.3, 742.5]);
  });

  it("ingests a wallbox_meter_demand sensor as a MeasurementPoint (Ladeinfrastruktur), not an Asset", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const chargingPoint = await measurementPoints.insert({
      tenantId: tenant.id,
      siteId: site.id,
      name: "LP-AC-01",
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Live Connector",
      secretReference: `env:${CLIENT_ID_VAR},env:${CLIENT_SECRET_VAR}`,
      siteId: site.id,
    });

    const lpDiscovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "device-3",
    });
    const lpMapped = await objectMappings.mapToMeasurementPoint({
      tenantId: tenant.id,
      id: lpDiscovered.id,
      targetMeasurementPointId: chargingPoint.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const consumptionTotal = await metricDefinitions.findByKey("energy_consumption_total");
    const consumptionPower = await metricDefinitions.findByKey("active_power_consumption");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: lpMapped.id,
      vendorSensorId: encodeVendorSensorId("sensor-lp", "energy_mm_counter_seqs"),
      metricDefinitionId: consumptionTotal!.id,
      unitFactor: 0.001,
    });
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: lpMapped.id,
      vendorSensorId: encodeVendorSensorId("sensor-lp", "power_mm_counter_seqs"),
      metricDefinitionId: consumptionPower!.id,
      unitFactor: 0.001,
    });

    const result = await liveIngest.pull(tenant.id, connector.id);

    expect(result.mapResult.measurementsIngested).toBe(2);

    const lpRows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("measurement_point_id", "=", chargingPoint.id)
      .execute();
    expect(lpRows).toHaveLength(2);
    const values = lpRows.map((r) => r.value).sort((a, b) => a - b);
    expect(values).toEqual([3, 5000]);
  });

  it("ingests grid_processed_price_eurocent as grid_energy_price, converted €-ct to EUR/kWh", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const gridConnection = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netzanschluss",
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Live Connector",
      secretReference: `env:${CLIENT_ID_VAR},env:${CLIENT_SECRET_VAR}`,
      siteId: site.id,
    });

    const priceDiscovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "device-4",
    });
    const priceMapped = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: priceDiscovered.id,
      targetAssetId: gridConnection.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const gridEnergyPrice = await metricDefinitions.findByKey("grid_energy_price");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: priceMapped.id,
      vendorSensorId: encodeVendorSensorId("sensor-price", "avg_mm_gauge_seqs"),
      metricDefinitionId: gridEnergyPrice!.id,
      unitFactor: 0.01,
    });

    const result = await liveIngest.pull(tenant.id, connector.id);

    expect(result.mapResult.measurementsIngested).toBe(1);

    const priceRow = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", gridConnection.id)
      .executeTakeFirst();
    expect(priceRow?.value).toBeCloseTo(0.0618);
  });
});
