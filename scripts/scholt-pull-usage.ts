/**
 * Pulls supplier-reported usage from the Scholt API (docs/data-requirements-scholt.md) and stores
 * it as SupplierUsageReading rows — a cross-check/tariff-window (peak/offpeak) signal only, never
 * written into the canonical EMS-sourced Measurement pipeline (the EMS is "the only true" source,
 * explicit user decision 02.09.2026). If the connection resolves to a real GRID_CONNECTION asset,
 * also prints a read-only comparison against the EMS-measured energy_import_total for the same
 * window.
 *
 * Usage:
 *   npm run scholt:pull-usage -- <tenantId> <connectorId> <client> <connection> <utilityType> <interval> <from> <until>
 *   (utilityType: ele|gas; interval: yearly|monthly|weekly|daily|hourly|quarterly; from/until: ISO date)
 */
import { config } from "dotenv";
config();

import { SupplierUsageComparisonService } from "../src/application/commercial/supplier-usage-comparison.service.js";
import { ScholtIngestService } from "../src/connectors/scholt/ingest.service.js";
import type { ScholtUsageInterval, ScholtUtilityType } from "../src/connectors/scholt/client.js";
import type { ConnectorId, TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { AssetRepository } from "../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../src/infrastructure/repositories/connector.repository.js";
import { EnergyCostStatementRepository } from "../src/infrastructure/repositories/energy-cost-statement.repository.js";
import { MeasurementRepository } from "../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../src/infrastructure/repositories/metric-definition.repository.js";
import { SupplierUsageReadingRepository } from "../src/infrastructure/repositories/supplier-usage-reading.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";
const USAGE_INTERVALS = ["yearly", "monthly", "weekly", "daily", "hourly", "quarterly"] as const;

async function main(): Promise<void> {
  const [tenantIdArg, connectorIdArg, clientArg, connectionArg, utilityTypeArg, intervalArg, fromArg, untilArg] =
    process.argv.slice(2);
  if (!tenantIdArg || !connectorIdArg || !clientArg || !connectionArg || !utilityTypeArg || !intervalArg) {
    console.error(
      "Usage: npm run scholt:pull-usage -- <tenantId> <connectorId> <client> <connection> <ele|gas> <interval> [from] [until]",
    );
    process.exitCode = 1;
    return;
  }
  if (utilityTypeArg !== "ele" && utilityTypeArg !== "gas") {
    console.error(`Invalid utilityType "${utilityTypeArg}" — expected "ele" or "gas"`);
    process.exitCode = 1;
    return;
  }
  if (!(USAGE_INTERVALS as readonly string[]).includes(intervalArg)) {
    console.error(`Invalid interval "${intervalArg}" — expected one of ${USAGE_INTERVALS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const tenantId = tenantIdArg as TenantId;
  const connectorId = connectorIdArg as ConnectorId;
  const utilityType: ScholtUtilityType = utilityTypeArg;
  const interval: ScholtUsageInterval = intervalArg as ScholtUsageInterval;

  const pool = createPool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL });
  const db = createDb(pool);

  try {
    const connectors = new ConnectorRepository(db);
    const assets = new AssetRepository(db);
    const measurements = new MeasurementRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    const energyCostStatements = new EnergyCostStatementRepository(db);
    const supplierUsageReadings = new SupplierUsageReadingRepository(db);
    const ingest = new ScholtIngestService({ connectors, assets, energyCostStatements, supplierUsageReadings });
    const comparison = new SupplierUsageComparisonService({ measurements, metricDefinitions, supplierUsageReadings });

    console.log(`Ziehe usage (${interval}) fuer Connection ${connectionArg} ...`);
    const result = await ingest.pullUsage(
      tenantId,
      connectorId,
      clientArg,
      connectionArg,
      utilityType,
      interval,
      fromArg,
      untilArg,
    );

    console.log("");
    console.log(`Messpunkte:         ${result.readings.length}`);
    console.log(`Summe (Anbieter):   ${result.totalConVolume.toFixed(2)} kWh`);

    const matchedAssetId = result.readings.find((r) => r.assetId)?.assetId;
    if (matchedAssetId && result.readings.length > 0) {
      // Use the requested from/until (until is inclusive per the vendor API, so +1 day makes it
      // an exclusive upper bound) rather than deriving bounds from the last bucket's own start —
      // a daily/monthly bucket's start is not its end, so that undercounts the final bucket.
      const from = fromArg ? new Date(`${fromArg}T00:00:00.000Z`) : result.readings[0]!.bucketStart;
      const to = untilArg
        ? new Date(new Date(`${untilArg}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
        : new Date(result.readings[result.readings.length - 1]!.bucketStart.getTime() + 24 * 60 * 60 * 1000);
      const cmp = await comparison.compare({
        tenantId,
        gridConnectionAssetId: matchedAssetId,
        connectionReference: connectionArg,
        from,
        to,
      });
      console.log("");
      console.log("Vergleich (informativ, EMS bleibt massgeblich):");
      console.log(`  EMS (energy_import_total):  ${cmp.emsImportKwh.toFixed(2)} kWh`);
      console.log(`  Anbieter (usage):           ${cmp.supplierReportedKwh.toFixed(2)} kWh`);
      console.log(
        `  Differenz:                  ${cmp.deltaKwh.toFixed(2)} kWh` +
          (cmp.deltaPct !== null ? ` (${cmp.deltaPct.toFixed(1)}%)` : ""),
      );
    } else {
      console.log("");
      console.log("Kein GRID_CONNECTION-Asset zugeordnet — kein EMS-Vergleich moeglich.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
