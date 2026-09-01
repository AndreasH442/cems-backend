/**
 * Runnable, readable walk-through of the full CEMS vertical slice against a real (persistent)
 * TimescaleDB — not an ephemeral Testcontainer. Requires `docker compose up -d` first.
 *
 * Part A: Wendeware fixture -> mapping -> Measurement (the "einfacher SOC-Import" story).
 * Part B: a hand-built setpoint-not-followed scenario -> Anomaly -> Case -> Action -> Verification.
 *
 * Every run creates a fresh, timestamp-suffixed tenant, so it's safe to run repeatedly against
 * the same persistent database — nothing gets truncated. Inspect the result afterwards with any
 * SQL client against DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CaseBuilder } from "../src/application/auditor/case-builder.js";
import { evaluateSetpointTracking, normalizeBatteryActualPower } from "../src/application/auditor/rules.js";
import { ControlIntentIngestionService } from "../src/application/ingestion/control-intent-ingestion.service.js";
import { MeasurementIngestionService } from "../src/application/ingestion/measurement-ingestion.service.js";
import { ManualOperationsService } from "../src/application/operations/manual-operations.service.js";
import { WendewareMapper } from "../src/connectors/wendeware/mapper.js";
import type { WendewareFixture } from "../src/connectors/wendeware/types.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { up } from "../src/infrastructure/db/migrate.js";
import { ActionRepository } from "../src/infrastructure/repositories/action.repository.js";
import { AnomalyRepository } from "../src/infrastructure/repositories/anomaly.repository.js";
import { AssetRepository } from "../src/infrastructure/repositories/asset.repository.js";
import { CaseEvidenceRepository } from "../src/infrastructure/repositories/case-evidence.repository.js";
import { CaseStatusHistoryRepository } from "../src/infrastructure/repositories/case-status-history.repository.js";
import { CaseSubjectRepository } from "../src/infrastructure/repositories/case-subject.repository.js";
import { CaseRepository } from "../src/infrastructure/repositories/case.repository.js";
import { ConnectorRepository } from "../src/infrastructure/repositories/connector.repository.js";
import { ControlIntentRepository } from "../src/infrastructure/repositories/control-intent.repository.js";
import { MeasurementRepository } from "../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../src/infrastructure/repositories/metric-definition.repository.js";
import { OrganizationRepository } from "../src/infrastructure/repositories/organization.repository.js";
import { SiteRepository } from "../src/infrastructure/repositories/site.repository.js";
import { TenantRepository } from "../src/infrastructure/repositories/tenant.repository.js";
import { VendorMetricMappingRepository } from "../src/infrastructure/repositories/vendor-metric-mapping.repository.js";
import { VendorObjectMappingRepository } from "../src/infrastructure/repositories/vendor-object-mapping.repository.js";
import { VerificationRepository } from "../src/infrastructure/repositories/verification.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";
const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/connectors/wendeware/fixtures/site-1-snapshot.json",
);

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL;
  console.log(`Connecting to ${databaseUrl}`);
  const pool = createPool({ connectionString: databaseUrl });
  const db = createDb(pool);

  try {
    section("Migrations");
    const applied = await up(pool);
    console.log(applied.length > 0 ? `Applied: ${applied.join(", ")}` : "Already up to date.");

    const tenants = new TenantRepository(db);
    const organizations = new OrganizationRepository(db);
    const sites = new SiteRepository(db);
    const assets = new AssetRepository(db);
    const connectors = new ConnectorRepository(db);
    const objectMappings = new VendorObjectMappingRepository(db);
    const metricMappings = new VendorMetricMappingRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    const measurements = new MeasurementRepository(db);
    const controlIntents = new ControlIntentRepository(db);
    const anomalies = new AnomalyRepository(db);
    const cases = new CaseRepository(db);
    const measurementIngestion = new MeasurementIngestionService(measurements, metricDefinitions);
    const controlIntentIngestion = new ControlIntentIngestionService(controlIntents, metricDefinitions);
    const caseBuilder = new CaseBuilder({
      cases,
      caseSubjects: new CaseSubjectRepository(db),
      caseEvidence: new CaseEvidenceRepository(db),
      caseStatusHistory: new CaseStatusHistoryRepository(db),
      anomalies,
    });
    const manualOps = new ManualOperationsService({
      actions: new ActionRepository(db),
      verifications: new VerificationRepository(db),
      cases,
      caseStatusHistory: new CaseStatusHistoryRepository(db),
    });

    section("Seeding tenant / site / assets");
    const runLabel = new Date().toISOString();
    const tenant = await tenants.insert({ name: `Demo Tenant ${runLabel}` });
    const organization = await organizations.insert({ tenantId: tenant.id, name: "Demo GmbH" });
    const site = await sites.insert({ tenantId: tenant.id, organizationId: organization.id, name: "Demo Standort" });
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });
    const inverter = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "PV_INVERTER",
      name: "PV-Wechselrichter 1",
    });
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`Site: ${site.name} (${site.id})`);
    console.log(`Assets: ${battery.name} (BATTERY_SYSTEM), ${inverter.name} (PV_INVERTER)`);

    section("Part A: Wendeware fixture -> mapping -> Measurement");
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Wendeware Site Connector",
      secretReference: "secret-store://wendeware/demo",
      siteId: site.id,
    });

    const batteryObject = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "bat.1",
    });
    const mappedBattery = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: batteryObject.id,
      targetAssetId: battery.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    const soc = await metricDefinitions.findByKey("state_of_charge");
    await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: mappedBattery.id,
      vendorSensorId: "soc",
      metricDefinitionId: soc!.id,
    });
    console.log(`Mapped vendor object "bat.1" -> ${battery.name}, sensor "soc" -> state_of_charge`);

    const mapper = new WendewareMapper({
      vendorObjectMappings: objectMappings,
      vendorMetricMappings: metricMappings,
      metricDefinitions,
      measurementIngestion,
      controlIntentIngestion,
    });
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as WendewareFixture;
    const mapResult = await mapper.mapAndIngest(tenant.id, connector.id, fixture);
    console.log(
      `Fixture processed: ${mapResult.measurementsIngested} measurement(s), ${mapResult.controlIntentsIngested} control intent(s), ` +
        `${mapResult.discovered.length} newly discovered object(s) (${mapResult.discovered.map((d) => d.vendorObjectId).join(", ")}), ` +
        `${mapResult.skippedSensors} sensor(s) skipped (unmapped)`,
    );

    section("Part B: BATTERY_SETPOINT_TRACKING_V1 -> Anomaly -> Case -> Action -> Verification");
    // Anchored a few minutes in the past (not "now"): findLatestBefore(..., new Date()) further
    // down needs every synthetic timestamp in this scenario to already be in the past by the
    // time it runs — the whole scenario spans t0..t0+50s of synthetic offsets, so a few minutes
    // of real headroom is more than enough regardless of how fast the script executes.
    const t0 = new Date(Date.now() - 5 * 60_000);
    await controlIntentIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      metricKey: "active_power_setpoint",
      timestamp: t0,
      value: -5,
    });
    // Not followed: charge/discharge net out far from the -5 kW setpoint.
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      measurementPointId: null,
      metricKey: "active_power_charge",
      timestamp: new Date(t0.getTime() + 10_000),
      value: 4,
      quality: "MEASURED",
    });
    await measurementIngestion.ingest({
      tenantId: tenant.id,
      subjectType: "ASSET",
      assetId: battery.id,
      componentId: null,
      measurementPointId: null,
      metricKey: "active_power_discharge",
      timestamp: new Date(t0.getTime() + 10_000),
      value: 0,
      quality: "MEASURED",
    });
    console.log("Ingested setpoint -5 kW, but actual net power came back at +4 kW (not followed).");

    const setpointMetric = await metricDefinitions.findByKey("active_power_setpoint");
    const chargeMetric = await metricDefinitions.findByKey("active_power_charge");
    const dischargeMetric = await metricDefinitions.findByKey("active_power_discharge");
    const setpoint = await controlIntents.findLatestBefore(tenant.id, battery.id, setpointMetric!.id, new Date());
    const windowEnd = new Date(setpoint!.timestamp.getTime() + 60_000);
    const charge = await measurements.findEarliestInWindow(
      tenant.id,
      battery.id,
      chargeMetric!.id,
      setpoint!.timestamp,
      windowEnd,
    );
    const discharge = await measurements.findEarliestInWindow(
      tenant.id,
      battery.id,
      dischargeMetric!.id,
      setpoint!.timestamp,
      windowEnd,
    );
    const actualValue = normalizeBatteryActualPower(charge!.value, discharge!.value);
    const candidate = evaluateSetpointTracking({
      assetId: battery.id,
      ruleKey: "BATTERY_SETPOINT_TRACKING_V1",
      setpoint: { value: setpoint!.value, timestamp: setpoint!.timestamp },
      actual: { value: actualValue, timestamp: charge!.timestamp },
    });

    if (!candidate) {
      console.log("Rule did not fire (unexpected for this demo scenario).");
    } else {
      const anomaly = await anomalies.insert({ tenantId: tenant.id, siteId: site.id, ...candidate });
      console.log(`Anomaly detected: ${anomaly.ruleKey} (confidence ${anomaly.confidence.toFixed(2)})`);
      console.log(`  ${anomaly.description}`);

      const kase = await caseBuilder.buildFromAnomalies(tenant.id, site.id, [anomaly]);
      console.log(`Case created: "${kase.title}" — severity=${kase.severity} status=${kase.status} (${kase.id})`);

      const action = await manualOps.recordAction(
        tenant.id,
        kase.id,
        "BATTERY_SETPOINT_TRACKING_V1",
        new Date(t0.getTime() + 20_000),
      );
      console.log(`Action recorded: "${action.description}"`);

      // The corrective action worked: a fresh setpoint is now actually followed.
      const t1 = new Date(t0.getTime() + 30_000);
      await controlIntentIngestion.ingest({
        tenantId: tenant.id,
        subjectType: "ASSET",
        assetId: battery.id,
        componentId: null,
        metricKey: "active_power_setpoint",
        timestamp: t1,
        value: -5,
      });
      await measurementIngestion.ingest({
        tenantId: tenant.id,
        subjectType: "ASSET",
        assetId: battery.id,
        componentId: null,
        measurementPointId: null,
        metricKey: "active_power_charge",
        timestamp: new Date(t1.getTime() + 10_000),
        value: 0,
        quality: "MEASURED",
      });
      await measurementIngestion.ingest({
        tenantId: tenant.id,
        subjectType: "ASSET",
        assetId: battery.id,
        componentId: null,
        measurementPointId: null,
        metricKey: "active_power_discharge",
        timestamp: new Date(t1.getTime() + 10_000),
        value: 5.0,
        quality: "MEASURED",
      });

      const setpoint2 = await controlIntents.findLatestBefore(tenant.id, battery.id, setpointMetric!.id, new Date());
      const windowEnd2 = new Date(setpoint2!.timestamp.getTime() + 60_000);
      const charge2 = await measurements.findEarliestInWindow(
        tenant.id,
        battery.id,
        chargeMetric!.id,
        setpoint2!.timestamp,
        windowEnd2,
      );
      const discharge2 = await measurements.findEarliestInWindow(
        tenant.id,
        battery.id,
        dischargeMetric!.id,
        setpoint2!.timestamp,
        windowEnd2,
      );
      const stillFires = evaluateSetpointTracking({
        assetId: battery.id,
        ruleKey: "BATTERY_SETPOINT_TRACKING_V1",
        setpoint: { value: setpoint2!.value, timestamp: setpoint2!.timestamp },
        actual: {
          value: normalizeBatteryActualPower(charge2!.value, discharge2!.value),
          timestamp: charge2!.timestamp,
        },
      });

      const verification = await manualOps.verifyAction(
        tenant.id,
        kase.id,
        action.id,
        stillFires !== null,
        new Date(t1.getTime() + 20_000),
      );
      const resolvedCase = await cases.findById(tenant.id, kase.id);
      console.log(`Verification result: ${verification.result} — case status now ${resolvedCase?.status}`);
    }

    section("Done");
    console.log(`Inspect the data yourself, e.g.:`);
    console.log(
      `  psql "${databaseUrl}" -c "select title, severity, status from cases where tenant_id='${tenant.id}'"`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
