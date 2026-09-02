/**
 * Pulls one connection/year/month cost breakdown from the Scholt API (docs/data-requirements-
 * scholt.md) and writes it as an EnergyCostStatement (ADR-014).
 *
 * Usage:
 *   npm run scholt:pull-costs -- <tenantId> <connectorId> <client> <connection> <utilityType> <year> <month>
 *   (utilityType: ele|gas)
 *
 * Never runs in CI. Requires SCHOLT_CLIENT_ID/SCHOLT_CLIENT_SECRET in .env (or whatever env vars
 * the connector's secret_reference names).
 */
import { config } from "dotenv";
config();

import { ScholtIngestService } from "../src/connectors/scholt/ingest.service.js";
import type { ScholtUtilityType } from "../src/connectors/scholt/client.js";
import type { ConnectorId, TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { AssetRepository } from "../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../src/infrastructure/repositories/connector.repository.js";
import { EnergyCostStatementRepository } from "../src/infrastructure/repositories/energy-cost-statement.repository.js";
import { SupplierUsageReadingRepository } from "../src/infrastructure/repositories/supplier-usage-reading.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";

async function main(): Promise<void> {
  const [tenantIdArg, connectorIdArg, clientArg, connectionArg, utilityTypeArg, yearArg, monthArg] =
    process.argv.slice(2);
  if (!tenantIdArg || !connectorIdArg || !clientArg || !connectionArg || !utilityTypeArg || !yearArg || !monthArg) {
    console.error(
      "Usage: npm run scholt:pull-costs -- <tenantId> <connectorId> <client> <connection> <ele|gas> <year> <month>",
    );
    process.exitCode = 1;
    return;
  }
  if (utilityTypeArg !== "ele" && utilityTypeArg !== "gas") {
    console.error(`Invalid utilityType "${utilityTypeArg}" — expected "ele" or "gas"`);
    process.exitCode = 1;
    return;
  }

  const tenantId = tenantIdArg as TenantId;
  const connectorId = connectorIdArg as ConnectorId;
  const utilityType: ScholtUtilityType = utilityTypeArg;
  const year = Number(yearArg);
  const month = Number(monthArg);

  const pool = createPool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL });
  const db = createDb(pool);

  try {
    const connectors = new ConnectorRepository(db);
    const assets = new AssetRepository(db);
    const energyCostStatements = new EnergyCostStatementRepository(db);
    const supplierUsageReadings = new SupplierUsageReadingRepository(db);
    const ingest = new ScholtIngestService({ connectors, assets, energyCostStatements, supplierUsageReadings });

    console.log(`Ziehe costoverview fuer Connection ${connectionArg}, ${year}-${String(month).padStart(2, "0")} ...`);
    const result = await ingest.pullCostOverview(
      tenantId,
      connectorId,
      clientArg,
      connectionArg,
      utilityType,
      year,
      month,
    );

    console.log("");
    console.log(`Statement:          ${result.statement.id}`);
    console.log(`Positionen:         ${result.lineCount}`);
    console.log(`Summe (netto):      ${result.totalAmount.toFixed(2)} EUR`);
    console.log(`Asset zugeordnet:   ${result.statement.assetId ?? "(kein Treffer ueber meteringPointId)"}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
