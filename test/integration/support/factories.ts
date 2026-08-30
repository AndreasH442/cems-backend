import type { Db } from "../../../src/infrastructure/db/kysely.js";
import { OrganizationRepository } from "../../../src/infrastructure/repositories/organization.repository.js";
import { SiteRepository } from "../../../src/infrastructure/repositories/site.repository.js";
import { TenantRepository } from "../../../src/infrastructure/repositories/tenant.repository.js";
import type { Site } from "../../../src/domain/tenancy/site.js";
import type { Tenant } from "../../../src/domain/tenancy/tenant.js";

/** Creates a minimal Tenant → Organization → Site chain for tests that need a Site to hang assets off. */
export async function createTenantWithSite(
  db: Db,
  overrides?: { tenantName?: string; organizationName?: string; siteName?: string },
): Promise<{ tenant: Tenant; site: Site }> {
  const tenants = new TenantRepository(db);
  const organizations = new OrganizationRepository(db);
  const sites = new SiteRepository(db);

  const tenant = await tenants.insert({ name: overrides?.tenantName ?? "Test Tenant" });
  const organization = await organizations.insert({
    tenantId: tenant.id,
    name: overrides?.organizationName ?? "Test Organization",
  });
  const site = await sites.insert({
    tenantId: tenant.id,
    organizationId: organization.id,
    name: overrides?.siteName ?? "Test Site",
  });

  return { tenant, site };
}
