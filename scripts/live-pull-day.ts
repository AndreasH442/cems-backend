/**
 * Backfills one full day (or any explicit range) of real Wendeware data — every reading in the
 * window, not just the latest per sensor (unlike scripts/live-pull.ts). Safe to re-run: same
 * upsert-on-natural-key dedup as live-pull.ts.
 *
 * Usage:
 *   npm run live:pull-day -- <tenantId> <connectorId> <dayISO> [resolution]
 *   (dayISO e.g. 2026-08-20; resolution defaults to "15 minutes", pass "1 minute" for near-native
 *   fidelity — docs/data-requirements.md: native sensor resolution is ~58s)
 *
 * Never runs in CI. Requires MPG_CLIENT_ID/MPG_CLIENT_SECRET in .env.
 */
import { config } from "dotenv";
config();

import { ControlIntentIngestionService } from "../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../src/application/ingestion/measurement-ingestion.service.js";
import { WendewareLiveIngestService } from "../src/connectors/wendeware/live-ingest.service.js";
import { WendewareMapper } from "../src/connectors/wendeware/mapper.js";
import type { ConnectorId, TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { ConnectorRepository } from "../src/infrastructure/repositories/connector.repository.js";
import { ControlIntentRepository } from "../src/infrastructure/repositories/control-intent.repository.js";
import { MeasurementRepository } from "../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../src/infrastructure/repositories/metric-definition.repository.js";
import { VendorMetricMappingRepository } from "../src/infrastructure/repositories/vendor-metric-mapping.repository.js";
import { VendorObjectMappingRepository } from "../src/infrastructure/repositories/vendor-object-mapping.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";
const DEFAULT_RESOLUTION = "15 minutes";

async function main(): Promise<void> {
  const [tenantIdArg, connectorIdArg, dayArg, resolutionArg] = process.argv.slice(2);
  if (!tenantIdArg || !connectorIdArg || !dayArg) {
    console.error("Usage: npm run live:pull-day -- <tenantId> <connectorId> <dayISO> [resolution]");
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;
  const connectorId = connectorIdArg as ConnectorId;
  const resolution = resolutionArg ?? DEFAULT_RESOLUTION;

  const dayStart = new Date(`${dayArg}T00:00:00.000Z`);
  if (Number.isNaN(dayStart.getTime())) {
    console.error(`Invalid day: "${dayArg}"`);
    process.exitCode = 1;
    return;
  }
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  const pool = createPool({ connectionString: databaseUrl });
  const db = createDb(pool);

  try {
    const connectors = new ConnectorRepository(db);
    const vendorObjectMappings = new VendorObjectMappingRepository(db);
    const vendorMetricMappings = new VendorMetricMappingRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    const measurements = new MeasurementRepository(db);
    const controlIntents = new ControlIntentRepository(db);

    const mapper = new WendewareMapper({
      vendorObjectMappings,
      vendorMetricMappings,
      metricDefinitions,
      measurementIngestion: new MeasurementIngestionService(measurements, metricDefinitions),
      controlIntentIngestion: new ControlIntentIngestionService(controlIntents, metricDefinitions),
    });
    const liveIngest = new WendewareLiveIngestService({ connectors, mapper });

    console.log(
      `Backfilling ${dayArg} (resolution "${resolution}") for tenant ${tenantId} / connector ${connectorId} ...`,
    );
    const result = await liveIngest.pullRange(tenantId, connectorId, dayStart, dayEnd, resolution);

    console.log("");
    console.log(`EMS gefunden:              ${result.emsCount}`);
    console.log(`Sensoren gefunden:         ${result.sensorCount}`);
    console.log(`Rohwerte abgerufen:        ${result.readingCount}`);
    console.log(`Measurements eingespielt:  ${result.mapResult.measurementsIngested}`);
    console.log(`ControlIntents eingespielt:${result.mapResult.controlIntentsIngested}`);
    console.log(`Sensoren uebersprungen:    ${result.mapResult.skippedSensors} (noch kein Mapping)`);

    const newlyDiscovered = result.mapResult.discovered.map((d) => d.vendorObjectId);
    if (newlyDiscovered.length > 0) {
      console.log("");
      console.log(`Neu entdeckt (${newlyDiscovered.length}): ${newlyDiscovered.join(", ")}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
