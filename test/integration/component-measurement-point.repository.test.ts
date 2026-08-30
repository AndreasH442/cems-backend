import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { MeasurementPointLinkingService } from "../../src/application/assets/measurement-point-linking.service.js";
import { AssetMeasurementPointRepository } from "../../src/infrastructure/repositories/asset-measurement-point.repository.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { ComponentRepository } from "../../src/infrastructure/repositories/component.repository.js";
import { MeasurementPointMeterRepository } from "../../src/infrastructure/repositories/measurement-point-meter.repository.js";
import { MeasurementPointRepository } from "../../src/infrastructure/repositories/measurement-point.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("Component / MeasurementPoint / AssetMeasurementPoint / MeasurementPointMeter", () => {
  let db: Db;
  let assets: AssetRepository;
  let components: ComponentRepository;
  let measurementPoints: MeasurementPointRepository;
  let assetMeasurementPoints: AssetMeasurementPointRepository;
  let measurementPointMeters: MeasurementPointMeterRepository;
  let linking: MeasurementPointLinkingService;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
    components = new ComponentRepository(db);
    measurementPoints = new MeasurementPointRepository(db);
    assetMeasurementPoints = new AssetMeasurementPointRepository(db);
    measurementPointMeters = new MeasurementPointMeterRepository(db);
    linking = new MeasurementPointLinkingService(assets, measurementPointMeters);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("creates a component scoped to its asset", async () => {
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
    expect(mppt.assetId).toBe(inverter.id);
    expect(await components.findById(tenant.id, mppt.id)).toEqual(mppt);
  });

  it("rejects an unknown component_type outside the canonical registry", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const asset = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "GENERIC_DEVICE", name: "x" });

    await expect(
      components.insert({
        tenantId: tenant.id,
        assetId: asset.id,
        // @ts-expect-error deliberately invalid for this test
        componentType: "NOT_A_REAL_TYPE",
        name: "Invalid",
      }),
    ).rejects.toThrow();
  });

  it("creates a measurement point scoped to its site (e.g. LP-AC-01)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-01" });
    expect(mp.siteId).toBe(site.id);
    expect(await measurementPoints.findById(tenant.id, mp.id)).toEqual(mp);
  });

  it("links an asset to a measurement point (n:m, temporally valid)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const meter = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "METER", name: "Zähler 1" });
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "Netzübergabe" });

    const link = await assetMeasurementPoints.insert({
      tenantId: tenant.id,
      assetId: meter.id,
      measurementPointId: mp.id,
      relationType: "PRIMARY",
      validFrom: new Date("2026-08-30T00:00:00Z"),
    });
    expect(link.relationType).toBe("PRIMARY");
    expect(link.validUntil).toBeNull();
  });

  it("rejects valid_until at or before valid_from for an asset-measurement-point link", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const asset = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "METER", name: "Zähler" });
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "MP" });

    await expect(
      assetMeasurementPoints.insert({
        tenantId: tenant.id,
        assetId: asset.id,
        measurementPointId: mp.id,
        relationType: "INPUT",
        validFrom: new Date("2026-08-30T10:00:00Z"),
        validUntil: new Date("2026-08-30T09:00:00Z"),
      }),
    ).rejects.toThrow();
  });

  it("links a METER asset to a measurement point via the linking service", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const meter = await assets.insert({ tenantId: tenant.id, siteId: site.id, assetType: "METER", name: "Zähler 1" });
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-01" });

    const link = await linking.linkMeter({
      tenantId: tenant.id,
      measurementPointId: mp.id,
      meterAssetId: meter.id,
      validFrom: new Date("2026-08-30T00:00:00Z"),
    });
    expect(link.meterAssetId).toBe(meter.id);
  });

  it("rejects linking a non-METER asset as a measurement point's meter", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });
    const mp = await measurementPoints.insert({ tenantId: tenant.id, siteId: site.id, name: "LP-AC-02" });

    await expect(
      linking.linkMeter({
        tenantId: tenant.id,
        measurementPointId: mp.id,
        meterAssetId: battery.id,
        validFrom: new Date("2026-08-30T00:00:00Z"),
      }),
    ).rejects.toThrow(/expected METER/);
  });
});
