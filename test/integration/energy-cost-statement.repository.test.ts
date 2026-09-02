import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { EnergyCostStatementRepository } from "../../src/infrastructure/repositories/energy-cost-statement.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("EnergyCostStatementRepository (real DB)", () => {
  let db: Db;
  let statements: EnergyCostStatementRepository;

  beforeAll(async () => {
    db = await getTestDb();
    statements = new EnergyCostStatementRepository(db);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("upsert is idempotent on (connection_reference, period_year, period_month) — re-pulling the same period replaces, not duplicates", async () => {
    const { tenant, site } = await createTenantWithSite(db);

    const first = await statements.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      supplierClientReference: "K00000001",
      connectionReference: "871111222233334444",
      utilityType: "ele",
      periodYear: 2025,
      periodMonth: 8,
    });
    const second = await statements.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      supplierClientReference: "K00000001",
      connectionReference: "871111222233334444",
      utilityType: "ele",
      periodYear: 2025,
      periodMonth: 8,
    });

    expect(second.id).toBe(first.id);
    const all = await statements.findBySite(tenant.id, site.id);
    expect(all).toHaveLength(1);
  });

  it("replaceLines deletes previous lines before inserting new ones (re-pull doesn't accumulate)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const statement = await statements.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      supplierClientReference: "K1",
      connectionReference: "conn-1",
      utilityType: "ele",
      periodYear: 2025,
      periodMonth: 8,
    });

    await statements.replaceLines(tenant.id, statement.id, [
      {
        tenantId: tenant.id,
        statementId: statement.id,
        month: 8,
        articleName: "Levering",
        articleGroup: "Energie",
        amount: 100,
      },
    ]);
    await statements.replaceLines(tenant.id, statement.id, [
      {
        tenantId: tenant.id,
        statementId: statement.id,
        month: 8,
        articleName: "Levering",
        articleGroup: "Energie",
        amount: 50,
      },
      {
        tenantId: tenant.id,
        statementId: statement.id,
        month: 8,
        articleName: "Energiebelasting",
        articleGroup: "Energiebelasting",
        amount: 30,
        extra: { utilitytariff: "peak" },
      },
    ]);

    const lines = await statements.findLinesByStatement(tenant.id, statement.id);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.amount).sort()).toEqual([30, 50]);
    const withExtra = lines.find((l) => l.articleGroup === "Energiebelasting");
    expect(withExtra?.extra).toEqual({ utilitytariff: "peak" });
  });

  it("sumByYear and sumByArticleGroup aggregate correctly across statements/lines", async () => {
    const { tenant, site } = await createTenantWithSite(db);

    const jan2024 = await statements.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      supplierClientReference: "K1",
      connectionReference: "conn-1",
      utilityType: "ele",
      periodYear: 2024,
      periodMonth: 1,
    });
    const jan2025 = await statements.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      supplierClientReference: "K1",
      connectionReference: "conn-1",
      utilityType: "ele",
      periodYear: 2025,
      periodMonth: 1,
    });
    const feb2025 = await statements.upsert({
      tenantId: tenant.id,
      siteId: site.id,
      supplierClientReference: "K1",
      connectionReference: "conn-1",
      utilityType: "ele",
      periodYear: 2025,
      periodMonth: 2,
    });

    await statements.replaceLines(tenant.id, jan2024.id, [
      {
        tenantId: tenant.id,
        statementId: jan2024.id,
        month: 1,
        articleName: "Levering",
        articleGroup: "Energie",
        amount: 100,
      },
    ]);
    await statements.replaceLines(tenant.id, jan2025.id, [
      {
        tenantId: tenant.id,
        statementId: jan2025.id,
        month: 1,
        articleName: "Levering",
        articleGroup: "Energie",
        amount: 200,
      },
      {
        tenantId: tenant.id,
        statementId: jan2025.id,
        month: 1,
        articleName: "Energiebelasting",
        articleGroup: "Energiebelasting",
        amount: 40,
      },
    ]);
    await statements.replaceLines(tenant.id, feb2025.id, [
      {
        tenantId: tenant.id,
        statementId: feb2025.id,
        month: 2,
        articleName: "Levering",
        articleGroup: "Energie",
        amount: 150,
      },
    ]);

    const byYear = await statements.sumByYear(tenant.id, site.id, 2024, 2025);
    expect(byYear).toEqual([
      { year: 2024, totalAmount: 100 },
      { year: 2025, totalAmount: 390 }, // 200 + 40 + 150
    ]);

    const byGroup = await statements.sumByArticleGroup(tenant.id, site.id, 2024, 2025);
    expect(byGroup).toEqual([
      { articleGroup: "Energie", totalAmount: 450 }, // 100 + 200 + 150
      { articleGroup: "Energiebelasting", totalAmount: 40 },
    ]);
  });

  it("tenant isolation — a statement from one tenant is invisible to another", async () => {
    const { tenant: tenantA, site: siteA } = await createTenantWithSite(db, { tenantName: "Tenant A" });
    const { tenant: tenantB } = await createTenantWithSite(db, { tenantName: "Tenant B" });

    await statements.upsert({
      tenantId: tenantA.id,
      siteId: siteA.id,
      supplierClientReference: "K1",
      connectionReference: "conn-1",
      utilityType: "ele",
      periodYear: 2025,
      periodMonth: 8,
    });

    const forB = await statements.findBySite(tenantB.id, siteA.id);
    expect(forB).toHaveLength(0);
  });
});
