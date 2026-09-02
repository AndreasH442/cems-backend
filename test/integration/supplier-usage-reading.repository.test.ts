import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { SupplierUsageReadingRepository } from "../../src/infrastructure/repositories/supplier-usage-reading.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("SupplierUsageReadingRepository (real DB)", () => {
  let db: Db;
  let readings: SupplierUsageReadingRepository;

  beforeAll(async () => {
    db = await getTestDb();
    readings = new SupplierUsageReadingRepository(db);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("upsert is idempotent on (connection_reference, interval, bucket_start)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const bucketStart = new Date("2026-08-01T00:00:00Z");

    await readings.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      connectionReference: "conn-1",
      utilityType: "ele",
      interval: "monthly",
      bucketStart,
      unit: "kWh",
      conVolume: 100,
    });
    await readings.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      connectionReference: "conn-1",
      utilityType: "ele",
      interval: "monthly",
      bucketStart,
      unit: "kWh",
      conVolume: 150, // corrected value on re-pull
    });

    const all = await readings.findBySite(tenant.id, site.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.conVolume).toBe(150);
  });

  it("sumInWindow aggregates con_volume/peak/offpeak across readings in range", async () => {
    const { tenant, site } = await createTenantWithSite(db);

    await readings.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      connectionReference: "conn-1",
      utilityType: "ele",
      interval: "monthly",
      bucketStart: new Date("2026-06-01T00:00:00Z"),
      unit: "kWh",
      conVolume: 100,
      conVolumePeak: 40,
      conVolumeOffpeak: 60,
    });
    await readings.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      connectionReference: "conn-1",
      utilityType: "ele",
      interval: "monthly",
      bucketStart: new Date("2026-07-01T00:00:00Z"),
      unit: "kWh",
      conVolume: 120,
      conVolumePeak: 50,
      conVolumeOffpeak: 70,
    });
    // Different connection — must not be included.
    await readings.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      connectionReference: "conn-2",
      utilityType: "ele",
      interval: "monthly",
      bucketStart: new Date("2026-06-15T00:00:00Z"),
      unit: "kWh",
      conVolume: 999,
    });

    const total = await readings.sumInWindow(
      tenant.id,
      "conn-1",
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z"),
    );
    expect(total.readingCount).toBe(2);
    expect(total.totalConVolume).toBeCloseTo(220);
    expect(total.totalConVolumePeak).toBeCloseTo(90);
    expect(total.totalConVolumeOffpeak).toBeCloseTo(130);
  });

  it("sumInWindow returns zero/empty for a window with no readings, not an error", async () => {
    const { tenant } = await createTenantWithSite(db);
    const total = await readings.sumInWindow(
      tenant.id,
      "conn-nonexistent",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(total).toEqual({
      totalConVolume: 0,
      totalConVolumePeak: null,
      totalConVolumeOffpeak: null,
      readingCount: 0,
    });
  });
});
