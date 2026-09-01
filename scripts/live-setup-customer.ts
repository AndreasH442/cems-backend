/**
 * One-time onboarding: creates Tenant -> Organization -> Site -> WENDEWARE Connector for a real
 * customer, so scripts/live-pull.ts has something to pull into. Run once; note the printed IDs.
 *
 * Usage:
 *   npm run live:setup-customer -- "<Firmenname>" ["<Standortname>"]
 *
 * Credentials come from .env (MPG_CLIENT_ID/MPG_CLIENT_SECRET) — never passed on the CLI, never
 * printed. The connector row only stores secret_reference="env:MPG_CLIENT_ID,env:MPG_CLIENT_SECRET".
 */
import { config } from "dotenv";
config();

import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { up } from "../src/infrastructure/db/migrate.js";
import { ConnectorRepository } from "../src/infrastructure/repositories/connector.repository.js";
import { OrganizationRepository } from "../src/infrastructure/repositories/organization.repository.js";
import { SiteRepository } from "../src/infrastructure/repositories/site.repository.js";
import { TenantRepository } from "../src/infrastructure/repositories/tenant.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";

async function main(): Promise<void> {
  const [companyName, siteName] = process.argv.slice(2);
  if (!companyName) {
    console.error('Usage: npm run live:setup-customer -- "<Firmenname>" ["<Standortname>"]');
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  const pool = createPool({ connectionString: databaseUrl });
  const db = createDb(pool);

  try {
    await up(pool);

    const tenants = new TenantRepository(db);
    const organizations = new OrganizationRepository(db);
    const sites = new SiteRepository(db);
    const connectors = new ConnectorRepository(db);

    const tenant = await tenants.insert({ name: companyName });
    const organization = await organizations.insert({ tenantId: tenant.id, name: companyName });
    const site = await sites.insert({
      tenantId: tenant.id,
      organizationId: organization.id,
      name: siteName ?? "Hauptstandort",
    });
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "myPowerGrid Live",
      secretReference: "env:MPG_CLIENT_ID,env:MPG_CLIENT_SECRET",
      siteId: site.id,
    });

    console.log(`Tenant:    ${tenant.id}`);
    console.log(`Site:      ${site.id}`);
    console.log(`Connector: ${connector.id}`);
    console.log("");
    console.log("Naechster Schritt:");
    console.log(`  npm run live:pull -- ${tenant.id} ${connector.id}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
