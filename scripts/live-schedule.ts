/**
 * Runs scripts/live-pull.ts's pull repeatedly, on a fixed interval, until Ctrl+C — the "caller"
 * that docs/first-vertical-slice.md deferred ("kein Discovery-Poller ... wiederholtes Aufrufen ist
 * Sache des Aufrufers"). One process, one connector; run multiple instances for multiple connectors.
 *
 * Usage:
 *   npm run live:schedule -- <tenantId> <connectorId> [intervalMinutes=15]
 *
 * Never runs in CI. Requires MPG_CLIENT_ID/MPG_CLIENT_SECRET in .env.
 */
import { config } from "dotenv";
config();

import { ControlIntentIngestionService } from "../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../src/application/ingestion/measurement-ingestion.service.js";
import { WendewareLiveIngestService } from "../src/connectors/wendeware/live-ingest.service.js";
import { WendewareLiveScheduler } from "../src/connectors/wendeware/live-scheduler.js";
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
const DEFAULT_INTERVAL_MINUTES = 15;

function main(): void {
  const [tenantIdArg, connectorIdArg, intervalArg] = process.argv.slice(2);
  if (!tenantIdArg || !connectorIdArg) {
    console.error("Usage: npm run live:schedule -- <tenantId> <connectorId> [intervalMinutes=15]");
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;
  const connectorId = connectorIdArg as ConnectorId;
  const intervalMinutes = intervalArg ? Number(intervalArg) : DEFAULT_INTERVAL_MINUTES;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    console.error(`Invalid intervalMinutes: "${intervalArg}"`);
    process.exitCode = 1;
    return;
  }
  // Wider than the pull interval so a single delayed/failed pull doesn't create a gap —
  // upsert on the natural key makes re-fetching overlap harmless (docs/data-requirements.md).
  const lookbackMinutes = Math.max(intervalMinutes * 2, 15);

  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  const pool = createPool({ connectionString: databaseUrl });
  const db = createDb(pool);

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
  const liveIngest = new WendewareLiveIngestService({ connectors, mapper }, lookbackMinutes);

  console.log(
    `Scheduler gestartet: tenant=${tenantId} connector=${connectorId} ` +
      `alle ${intervalMinutes} min (Lookback ${lookbackMinutes} min). Stop mit Ctrl+C.`,
  );

  const scheduler = new WendewareLiveScheduler({ pull: (t, c) => liveIngest.pull(t, c) }, tenantId, connectorId, {
    intervalMs: intervalMinutes * 60_000,
    onResult: (result) => {
      const newlyDiscovered = result.mapResult.discovered.length;
      console.log(
        `[${new Date().toISOString()}] Measurements=${result.mapResult.measurementsIngested} ` +
          `ControlIntents=${result.mapResult.controlIntentsIngested} ` +
          `uebersprungen=${result.mapResult.skippedSensors} neu_entdeckt=${newlyDiscovered}`,
      );
    },
    onError: (error) => {
      console.error(`[${new Date().toISOString()}] Pull fehlgeschlagen:`, error);
    },
  });

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("");
    console.log("Stoppe Scheduler ...");
    scheduler.stop();
    pool
      .end()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  scheduler.start();
}

try {
  main();
} catch (err: unknown) {
  console.error(err);
  process.exitCode = 1;
}
