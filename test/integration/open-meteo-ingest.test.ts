import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { MeasurementIngestionService } from "../../src/application/ingestion/measurement-ingestion.service.js";
import { OpenMeteoIngestService } from "../../src/connectors/open-meteo/ingest.service.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../../src/infrastructure/repositories/connector.repository.js";
import { MeasurementPointRepository } from "../../src/infrastructure/repositories/measurement-point.repository.js";
import { MeasurementRepository } from "../../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { SiteRepository } from "../../src/infrastructure/repositories/site.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

/**
 * Synthetic Open-Meteo forecast response — one slot in the past (now - 30min, quality=MEASURED
 * expected) and one in the future (now + 2h, quality=ESTIMATED expected). Shape matches
 * docs/data-requirements-open-meteo.md. No real coordinates, no real customer data.
 */
function mockFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  const now = new Date();
  const past = new Date(now.getTime() - 30 * 60_000);
  const future = new Date(now.getTime() + 2 * 60 * 60_000);
  const toLocalIso = (d: Date) => d.toISOString().slice(0, 16);

  if (href.includes("archive-api.open-meteo.com")) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          utc_offset_seconds: 0,
          hourly: {
            time: ["2026-08-15T10:00", "2026-08-15T11:00"],
            global_tilted_irradiance: [400, 450],
            temperature_2m: [19, 20],
            wind_speed_10m: [3, 3.5],
            cloud_cover: [20, 25],
          },
        }),
        { status: 200 },
      ),
    );
  }

  return Promise.resolve(
    new Response(
      JSON.stringify({
        utc_offset_seconds: 0,
        minutely_15: {
          time: [toLocalIso(past), toLocalIso(future)],
          global_tilted_irradiance: [500, 700],
          temperature_2m: [18, 22],
          wind_speed_10m: [2, 4],
          cloud_cover: [30, 10],
        },
      }),
      { status: 200 },
    ),
  );
}

describe("OpenMeteoIngestService (fetch mocked, real DB)", () => {
  let db: Db;
  let sites: SiteRepository;
  let assets: AssetRepository;
  let connectors: ConnectorRepository;
  let measurementPoints: MeasurementPointRepository;
  let metricDefinitions: MetricDefinitionRepository;
  let ingest: OpenMeteoIngestService;

  beforeAll(async () => {
    db = await getTestDb();
    sites = new SiteRepository(db);
    assets = new AssetRepository(db);
    connectors = new ConnectorRepository(db);
    measurementPoints = new MeasurementPointRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);

    const measurements = new MeasurementRepository(db);
    ingest = new OpenMeteoIngestService(
      {
        connectors,
        sites,
        assets,
        measurementIngestion: new MeasurementIngestionService(measurements, metricDefinitions),
      },
      0,
      1,
    );
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(mockFetch));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("skips cleanly when the site has no coordinates yet", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "OPEN_METEO",
      name: "Weather Connector",
      secretReference: "none:no-credentials-needed",
      siteId: site.id,
    });
    const weatherPoint = await measurementPoints.insert({
      tenantId: tenant.id,
      siteId: site.id,
      name: "Standortwetter",
    });

    const result = await ingest.pull(tenant.id, connector.id, weatherPoint.id);

    expect(result.skippedReason).toBe("Site has no latitude/longitude configured yet");
    expect(result.weatherPointsIngested).toBe(0);
  });

  it("ingests weather Measurements with MEASURED/ESTIMATED quality by past/future, no PV_SYSTEM present", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    await sites.updateLocation({ tenantId: tenant.id, id: site.id, latitude: 48.9, longitude: 11.2 });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "OPEN_METEO",
      name: "Weather Connector",
      secretReference: "none:no-credentials-needed",
      siteId: site.id,
    });
    const weatherPoint = await measurementPoints.insert({
      tenantId: tenant.id,
      siteId: site.id,
      name: "Standortwetter",
    });

    const result = await ingest.pull(tenant.id, connector.id, weatherPoint.id);

    expect(result.skippedReason).toBeNull();
    expect(result.weatherPointsIngested).toBe(8); // 2 slots x 4 weather variables
    expect(result.expectedPowerPointsIngested).toBe(0);
    expect(result.pvSystemsConfigured).toBe(0);

    const rows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("measurement_point_id", "=", weatherPoint.id)
      .orderBy("timestamp", "asc")
      .execute();
    expect(rows).toHaveLength(8);

    const irradianceMetric = await metricDefinitions.findByKey("irradiance");
    const pastRow = rows.find((r) => r.metric_definition_id === irradianceMetric!.id && r.value === 500);
    const futureRow = rows.find((r) => r.metric_definition_id === irradianceMetric!.id && r.value === 700);
    expect(pastRow?.quality).toBe("MEASURED");
    expect(futureRow?.quality).toBe("ESTIMATED");
  });

  it("computes expected_active_power for a configured PV_SYSTEM asset (quality=CALCULATED)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    await sites.updateLocation({ tenantId: tenant.id, id: site.id, latitude: 48.9, longitude: 11.2 });
    const pvSystem = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_SYSTEM",
      name: "PV-Anlage",
      configuration: { nominalCapacityKwp: 100, acCapacityKw: 90, tiltDegrees: 10, azimuthDegrees: 0 },
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "OPEN_METEO",
      name: "Weather Connector",
      secretReference: "none:no-credentials-needed",
      siteId: site.id,
    });
    const weatherPoint = await measurementPoints.insert({
      tenantId: tenant.id,
      siteId: site.id,
      name: "Standortwetter",
    });

    const result = await ingest.pull(tenant.id, connector.id, weatherPoint.id);

    expect(result.pvSystemsConfigured).toBe(1);
    expect(result.pvSystemsSkipped).toBe(0);
    expect(result.expectedPowerPointsIngested).toBe(2); // one per weather slot

    const rows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", pvSystem.id)
      .execute();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.quality).toBe("CALCULATED");
      expect(row.value).toBeGreaterThan(0);
      expect(row.value).toBeLessThanOrEqual(90);
    }
  });

  it("skips a PV_SYSTEM asset with an incomplete configuration, without failing the whole pull", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    await sites.updateLocation({ tenantId: tenant.id, id: site.id, latitude: 48.9, longitude: 11.2 });
    await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_SYSTEM",
      name: "PV-Anlage ohne Stammdaten",
      // Missing configuration entirely — defaults to '{}' from the migration.
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "OPEN_METEO",
      name: "Weather Connector",
      secretReference: "none:no-credentials-needed",
      siteId: site.id,
    });
    const weatherPoint = await measurementPoints.insert({
      tenantId: tenant.id,
      siteId: site.id,
      name: "Standortwetter",
    });

    const result = await ingest.pull(tenant.id, connector.id, weatherPoint.id);

    expect(result.pvSystemsConfigured).toBe(0);
    expect(result.pvSystemsSkipped).toBe(1);
    expect(result.expectedPowerPointsIngested).toBe(0);
    expect(result.weatherPointsIngested).toBe(8);
  });

  it("pullArchive ingests hourly ERA5 slots, always as quality=MEASURED", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    await sites.updateLocation({ tenantId: tenant.id, id: site.id, latitude: 48.9, longitude: 11.2 });
    const pvSystem = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_SYSTEM",
      name: "PV-Anlage",
      configuration: { nominalCapacityKwp: 100, acCapacityKw: 90, tiltDegrees: 10, azimuthDegrees: 0 },
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "OPEN_METEO",
      name: "Weather Connector",
      secretReference: "none:no-credentials-needed",
      siteId: site.id,
    });
    const weatherPoint = await measurementPoints.insert({
      tenantId: tenant.id,
      siteId: site.id,
      name: "Standortwetter",
    });

    const result = await ingest.pullArchive(tenant.id, connector.id, weatherPoint.id, "2026-08-15", "2026-08-15");

    expect(result.skippedReason).toBeNull();
    expect(result.weatherPointsIngested).toBe(8); // 2 hourly slots x 4 variables
    expect(result.expectedPowerPointsIngested).toBe(2);

    const weatherRows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("measurement_point_id", "=", weatherPoint.id)
      .execute();
    expect(weatherRows).toHaveLength(8);
    for (const row of weatherRows) {
      expect(row.quality).toBe("MEASURED");
    }

    const expectedRows = await db
      .selectFrom("measurements")
      .selectAll()
      .where("tenant_id", "=", tenant.id)
      .where("asset_id", "=", pvSystem.id)
      .execute();
    expect(expectedRows).toHaveLength(2);
    for (const row of expectedRows) {
      expect(row.quality).toBe("CALCULATED");
    }
  });
});
