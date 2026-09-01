/**
 * Runs one real pull against the myPowerGrid API for an already-onboarded customer
 * (see scripts/live-setup-customer.ts) and prints a readable summary. Safe to re-run.
 *
 * Usage:
 *   npm run live:pull -- <tenantId> <connectorId>
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

async function main(): Promise<void> {
  const [tenantIdArg, connectorIdArg] = process.argv.slice(2);
  if (!tenantIdArg || !connectorIdArg) {
    console.error("Usage: npm run live:pull -- <tenantId> <connectorId>");
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;
  const connectorId = connectorIdArg as ConnectorId;

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

    console.log(`Pulling live data for tenant ${tenantId} / connector ${connectorId} ...`);
    const result = await liveIngest.pull(tenantId, connectorId);

    console.log("");
    console.log(`EMS gefunden:              ${result.emsCount}`);
    console.log(`Sensoren gefunden:         ${result.sensorCount}`);
    console.log(`Measurements eingespielt:  ${result.mapResult.measurementsIngested}`);
    console.log(`ControlIntents eingespielt:${result.mapResult.controlIntentsIngested}`);
    console.log(`Sensoren uebersprungen:    ${result.mapResult.skippedSensors} (noch kein Mapping)`);

    const newlyDiscovered = new Set(result.mapResult.discovered.map((d) => d.vendorObjectId));
    if (result.sensorsByDevice.size > 0) {
      console.log("");
      console.log(`Geraete mit Sensordaten in diesem Fenster (${result.sensorsByDevice.size}):`);
      for (const [deviceId, sensors] of result.sensorsByDevice) {
        const marker = newlyDiscovered.has(deviceId) ? " (neu entdeckt)" : "";
        console.log(`  vendor_object_id=${deviceId}${marker}`);
        for (const s of sensors) {
          console.log(`      sensor=${s.sensorId}  label="${s.label}"  unit="${s.unit}"`);
        }
      }
      console.log("");
      console.log(
        "Geraete ohne Asset-Mapping liefern keine Measurements/ControlIntents — erst nach " +
          "assets.insert(...) + vendorObjectMappings.mapToAsset(...) + vendorMetricMappings.insert(...) " +
          "fliessen ihre Werte ein.",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
