import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { OrganizationRepository } from "../../src/infrastructure/repositories/organization.repository.js";
import { SiteRepository } from "../../src/infrastructure/repositories/site.repository.js";
import { TenantRepository } from "../../src/infrastructure/repositories/tenant.repository.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("tenancy repositories", () => {
  let db: Db;
  let tenants: TenantRepository;
  let organizations: OrganizationRepository;
  let sites: SiteRepository;

  beforeAll(async () => {
    db = await getTestDb();
    tenants = new TenantRepository(db);
    organizations = new OrganizationRepository(db);
    sites = new SiteRepository(db);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("creates a tenant with default status ACTIVE", async () => {
    const tenant = await tenants.insert({ name: "Acme Energy" });

    expect(tenant.status).toBe("ACTIVE");
    expect(await tenants.findById(tenant.id)).toEqual(tenant);
  });

  it("creates an organization scoped to a tenant and a site scoped to that organization", async () => {
    const tenant = await tenants.insert({ name: "Acme Energy" });
    const organization = await organizations.insert({ tenantId: tenant.id, name: "Acme GmbH" });
    const site = await sites.insert({
      tenantId: tenant.id,
      organizationId: organization.id,
      name: "Standort Nord",
    });

    expect(organization.tenantId).toBe(tenant.id);
    expect(site.tenantId).toBe(tenant.id);
    expect(site.organizationId).toBe(organization.id);
    expect(await sites.findById(tenant.id, site.id)).toEqual(site);
  });

  it("rejects a site whose organization belongs to a different tenant (ADR-006 composite FK)", async () => {
    const tenantA = await tenants.insert({ name: "Tenant A" });
    const tenantB = await tenants.insert({ name: "Tenant B" });
    const orgUnderA = await organizations.insert({ tenantId: tenantA.id, name: "Org A" });

    await expect(
      sites.insert({ tenantId: tenantB.id, organizationId: orgUnderA.id, name: "Cross-tenant site" }),
    ).rejects.toThrow();
  });
});
