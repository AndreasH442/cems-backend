import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { SiteRepository } from "../../src/infrastructure/repositories/site.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("asset repository", () => {
  let db: Db;
  let assets: AssetRepository;

  beforeAll(async () => {
    db = await getTestDb();
    assets = new AssetRepository(db);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("creates a battery system asset scoped to a site", async () => {
    const { tenant, site } = await createTenantWithSite(db);

    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });

    expect(battery.assetType).toBe("BATTERY_SYSTEM");
    expect(await assets.findById(tenant.id, battery.id)).toEqual(battery);
  });

  it("allows a hierarchical asset (same tenant and site as its parent)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const inverter = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "PV-Wechselrichter",
    });

    const child = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "GENERIC_DEVICE",
      name: "Unterobjekt",
      parentAssetId: inverter.id,
    });

    expect(child.parentAssetId).toBe(inverter.id);
  });

  it("rejects an unknown asset_type outside the canonical registry", async () => {
    const { tenant, site } = await createTenantWithSite(db);

    await expect(
      assets.insert({
        // @ts-expect-error deliberately invalid for this test
        assetType: "NOT_A_REAL_TYPE",
        tenantId: tenant.id,
        siteId: site.id,
        name: "Invalid",
      }),
    ).rejects.toThrow();
  });

  it("rejects a parent asset that belongs to a different site (hierarchy must stay within one site)", async () => {
    const { tenant, site: siteA } = await createTenantWithSite(db, { siteName: "Standort A" });
    const sites = new SiteRepository(db);
    const siteB = await sites.insert({
      tenantId: tenant.id,
      organizationId: siteA.organizationId,
      name: "Standort B",
    });

    const parentInSiteA = await assets.insert({
      tenantId: tenant.id,
      siteId: siteA.id,
      assetType: "EMS",
      name: "EMS A",
    });

    await expect(
      assets.insert({
        tenantId: tenant.id,
        siteId: siteB.id,
        assetType: "GENERIC_DEVICE",
        name: "Cross-site child",
        parentAssetId: parentInSiteA.id,
      }),
    ).rejects.toThrow();
  });

  it("rejects an asset that is its own parent", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    // The FK requires the parent row to already exist, so a genuine self-reference
    // can only be attempted via UPDATE; the CHECK constraint covers that path.
    const asset = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "EMS",
      name: "Self-referencing candidate",
    });

    await expect(
      db.updateTable("assets").set({ parent_asset_id: asset.id }).where("id", "=", asset.id).execute(),
    ).rejects.toThrow();
  });
});
