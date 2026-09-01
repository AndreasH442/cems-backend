/**
 * Runs one real pull against the Open-Meteo Forecast API for an already-onboarded site
 * (needs sites.latitude/longitude set, and ideally a PV_SYSTEM asset with a valid
 * `configuration` — see docs/data-requirements-open-meteo.md) and prints a readable summary.
 * Safe to re-run (upsert on natural key, same as the Wendeware connector).
 *
 * Usage:
 *   npm run weather:pull -- <tenantId> <connectorId> <weatherMeasurementPointId>
 */
import { MeasurementIngestionService } from "../src/application/ingestion/measurement-ingestion.service.js";
import { OpenMeteoIngestService } from "../src/connectors/open-meteo/ingest.service.js";
import type { ConnectorId, MeasurementPointId, TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { AssetRepository } from "../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../src/infrastructure/repositories/connector.repository.js";
import { MeasurementRepository } from "../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../src/infrastructure/repositories/metric-definition.repository.js";
import { SiteRepository } from "../src/infrastructure/repositories/site.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";

async function main(): Promise<void> {
  const [tenantIdArg, connectorIdArg, weatherPointIdArg] = process.argv.slice(2);
  if (!tenantIdArg || !connectorIdArg || !weatherPointIdArg) {
    console.error("Usage: npm run weather:pull -- <tenantId> <connectorId> <weatherMeasurementPointId>");
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;
  const connectorId = connectorIdArg as ConnectorId;
  const weatherMeasurementPointId = weatherPointIdArg as MeasurementPointId;

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  const pool = createPool({ connectionString: databaseUrl });
  const db = createDb(pool);

  try {
    const connectors = new ConnectorRepository(db);
    const sites = new SiteRepository(db);
    const assets = new AssetRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    const measurements = new MeasurementRepository(db);

    const ingest = new OpenMeteoIngestService({
      connectors,
      sites,
      assets,
      measurementIngestion: new MeasurementIngestionService(measurements, metricDefinitions),
    });

    console.log(`Pulling weather for tenant ${tenantId} / connector ${connectorId} ...`);
    const result = await ingest.pull(tenantId, connectorId, weatherMeasurementPointId);

    console.log("");
    if (result.skippedReason) {
      console.log(`Uebersprungen: ${result.skippedReason}`);
      return;
    }
    console.log(`Wetter-Messpunkte eingespielt:       ${result.weatherPointsIngested}`);
    console.log(`Erwartete-Leistung-Punkte eingespielt: ${result.expectedPowerPointsIngested}`);
    console.log(`PV_SYSTEM konfiguriert:              ${result.pvSystemsConfigured}`);
    console.log(`PV_SYSTEM uebersprungen (kein Config): ${result.pvSystemsSkipped}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
