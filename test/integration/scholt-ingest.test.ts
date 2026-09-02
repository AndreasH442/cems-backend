import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { ScholtIngestService } from "../../src/connectors/scholt/ingest.service.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../../src/infrastructure/repositories/connector.repository.js";
import { EnergyCostStatementRepository } from "../../src/infrastructure/repositories/energy-cost-statement.repository.js";
import { SupplierUsageReadingRepository } from "../../src/infrastructure/repositories/supplier-usage-reading.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

const IDENTIFIER_VAR = "TEST_SCHOLT_IDENTIFIER";
const SECRET_VAR = "TEST_SCHOLT_SECRET";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function mockFetch(url: string | URL | Request): Promise<Response> {
  const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;

  if (href.includes("/usage/")) {
    return Promise.resolve(
      jsonResponse({
        reference: "871111222233334444",
        interval: "monthly",
        usage: [
          {
            datetime: "2026-08-01",
            unit: "kWh",
            con_volume: 13602.167,
            con_volume_peak: 4080.832,
            con_volume_offpeak: 9521.335,
          },
        ],
      }),
    );
  }

  return Promise.resolve(
    jsonResponse({
      client: "K00000001",
      connection: "871111222233334444",
      year: 2025,
      month: 8,
      lines: [
        {
          month: 8,
          article_name: "Levering",
          article_group: "Energie",
          amount: 977.0,
          taxamount: 205.17,
          unitprice: 0.0977,
        },
        {
          month: 8,
          article_name: "Energiebelasting",
          article_group: "Energiebelasting",
          taxpercentage: 21.0,
          slice_from: 0,
          slice_to: 10000,
          quantity: 10000.0,
          amount: 37.92,
          taxamount: 7.96,
        },
      ],
    }),
  );
}

describe("ScholtIngestService (fetch mocked, real DB)", () => {
  let db: Db;
  let assets: AssetRepository;
  let connectors: ConnectorRepository;
  let energyCostStatements: EnergyCostStatementRepository;
  let supplierUsageReadings: SupplierUsageReadingRepository;
  let ingest: ScholtIngestService;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    connectors = new ConnectorRepository(db);
    energyCostStatements = new EnergyCostStatementRepository(db);
    supplierUsageReadings = new SupplierUsageReadingRepository(db);
    ingest = new ScholtIngestService({ connectors, assets, energyCostStatements, supplierUsageReadings });
  });

  beforeEach(() => {
    process.env[IDENTIFIER_VAR] = "fake-identifier";
    process.env[SECRET_VAR] = "fake-secret";
    vi.stubGlobal("fetch", vi.fn(mockFetch));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env[IDENTIFIER_VAR];
    delete process.env[SECRET_VAR];
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("resolves assetId via GRID_CONNECTION.configuration.meteringPointId and writes the statement + lines", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const gridConnection = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netzanschluss",
      configuration: { meteringPointId: "871111222233334444" },
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "SCHOLT",
      name: "Scholt",
      secretReference: `env:${IDENTIFIER_VAR},env:${SECRET_VAR}`,
      siteId: site.id,
    });

    const result = await ingest.pullCostOverview(
      tenant.id,
      connector.id,
      "K00000001",
      "871111222233334444",
      "ele",
      2025,
      8,
    );

    expect(result.lineCount).toBe(2);
    expect(result.totalAmount).toBeCloseTo(977 + 37.92);
    expect(result.statement.assetId).toBe(gridConnection.id);
    expect(result.statement.siteId).toBe(site.id);
    expect(result.statement.periodYear).toBe(2025);
    expect(result.statement.periodMonth).toBe(8);

    const lines = await energyCostStatements.findLinesByStatement(tenant.id, result.statement.id);
    expect(lines).toHaveLength(2);
  });

  it("falls back to the connector's own siteId, with assetId=null, when no GRID_CONNECTION matches", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "SCHOLT",
      name: "Scholt",
      secretReference: `env:${IDENTIFIER_VAR},env:${SECRET_VAR}`,
      siteId: site.id,
    });

    const result = await ingest.pullCostOverview(
      tenant.id,
      connector.id,
      "K00000001",
      "871111222233334444",
      "ele",
      2025,
      8,
    );

    expect(result.statement.assetId).toBeNull();
    expect(result.statement.siteId).toBe(site.id);
  });

  it("re-pulling the same period replaces the lines instead of accumulating them", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "SCHOLT",
      name: "Scholt",
      secretReference: `env:${IDENTIFIER_VAR},env:${SECRET_VAR}`,
      siteId: site.id,
    });

    await ingest.pullCostOverview(tenant.id, connector.id, "K00000001", "871111222233334444", "ele", 2025, 8);
    const second = await ingest.pullCostOverview(
      tenant.id,
      connector.id,
      "K00000001",
      "871111222233334444",
      "ele",
      2025,
      8,
    );

    const lines = await energyCostStatements.findLinesByStatement(tenant.id, second.statement.id);
    expect(lines).toHaveLength(2);
    const allStatements = await energyCostStatements.findBySite(tenant.id, site.id);
    expect(allStatements).toHaveLength(1);
  });

  it("pullUsage stores readings with the peak/offpeak split, resolved against the matched asset", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const gridConnection = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GRID_CONNECTION",
      name: "Netzanschluss",
      configuration: { meteringPointId: "871111222233334444" },
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "SCHOLT",
      name: "Scholt",
      secretReference: `env:${IDENTIFIER_VAR},env:${SECRET_VAR}`,
      siteId: site.id,
    });

    const result = await ingest.pullUsage(tenant.id, connector.id, "K00000001", "871111222233334444", "ele", "monthly");

    expect(result.readings).toHaveLength(1);
    expect(result.totalConVolume).toBeCloseTo(13602.167);
    expect(result.readings[0]!.assetId).toBe(gridConnection.id);
    expect(result.readings[0]!.conVolumePeak).toBeCloseTo(4080.832);
    expect(result.readings[0]!.conVolumeOffpeak).toBeCloseTo(9521.335);

    const stored = await supplierUsageReadings.findBySite(tenant.id, site.id);
    expect(stored).toHaveLength(1);
  });

  it("re-pulling the same usage bucket replaces it instead of accumulating", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "SCHOLT",
      name: "Scholt",
      secretReference: `env:${IDENTIFIER_VAR},env:${SECRET_VAR}`,
      siteId: site.id,
    });

    await ingest.pullUsage(tenant.id, connector.id, "K00000001", "871111222233334444", "ele", "monthly");
    await ingest.pullUsage(tenant.id, connector.id, "K00000001", "871111222233334444", "ele", "monthly");

    const stored = await supplierUsageReadings.findBySite(tenant.id, site.id);
    expect(stored).toHaveLength(1);
  });
});
