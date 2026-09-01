/**
 * Runs BATTERY_SETPOINT_TRACKING_V1 and PV_SETPOINT_VS_ACTUAL_V1 (ADR-009) against whatever
 * Measurement/ControlIntent data already exists for a tenant's BATTERY_SYSTEM/PV_INVERTER
 * assets (e.g. after scripts/live-pull.ts) and builds a Case for every anomaly found.
 *
 * Usage:
 *   npm run live:run-auditor -- <tenantId>
 */
import { config } from "dotenv";
config();

import { CaseBuilder } from "../src/application/auditor/case-builder.js";
import { evaluateSetpointTracking, normalizeBatteryActualPower } from "../src/application/auditor/rules.js";
import type { Anomaly } from "../src/domain/auditor/anomaly.js";
import type { Asset } from "../src/domain/assets/asset.js";
import type { AssetId, TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb, type Db } from "../src/infrastructure/db/kysely.js";
import { AnomalyRepository } from "../src/infrastructure/repositories/anomaly.repository.js";
import { AssetRepository } from "../src/infrastructure/repositories/asset.repository.js";
import { CaseEvidenceRepository } from "../src/infrastructure/repositories/case-evidence.repository.js";
import { CaseStatusHistoryRepository } from "../src/infrastructure/repositories/case-status-history.repository.js";
import { CaseSubjectRepository } from "../src/infrastructure/repositories/case-subject.repository.js";
import { CaseRepository } from "../src/infrastructure/repositories/case.repository.js";
import { ControlIntentRepository } from "../src/infrastructure/repositories/control-intent.repository.js";
import { MeasurementRepository } from "../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../src/infrastructure/repositories/metric-definition.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";
const GRACE_WINDOW_MS = 60_000;

async function findAssetsByTenant(db: Db, assets: AssetRepository, tenantId: TenantId): Promise<Asset[]> {
  const rows = await db.selectFrom("assets").select(["id"]).where("tenant_id", "=", tenantId).execute();
  const resolved = await Promise.all(rows.map((r) => assets.findById(tenantId, r.id as AssetId)));
  return resolved.filter((a): a is Asset => a !== null);
}

async function main(): Promise<void> {
  const [tenantIdArg] = process.argv.slice(2);
  if (!tenantIdArg) {
    console.error("Usage: npm run live:run-auditor -- <tenantId>");
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;

  const pool = createPool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL });
  const db = createDb(pool);

  try {
    const assets = new AssetRepository(db);
    const measurements = new MeasurementRepository(db);
    const controlIntents = new ControlIntentRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    const anomalies = new AnomalyRepository(db);
    const caseBuilder = new CaseBuilder({
      cases: new CaseRepository(db),
      caseSubjects: new CaseSubjectRepository(db),
      caseEvidence: new CaseEvidenceRepository(db),
      caseStatusHistory: new CaseStatusHistoryRepository(db),
      anomalies,
    });

    const [setpointMetric, chargeMetric, dischargeMetric, generationMetric] = await Promise.all([
      metricDefinitions.findByKey("active_power_setpoint"),
      metricDefinitions.findByKey("active_power_charge"),
      metricDefinitions.findByKey("active_power_discharge"),
      metricDefinitions.findByKey("active_power_generation"),
    ]);

    const allAssets = await findAssetsByTenant(db, assets, tenantId);
    let anomalyCount = 0;

    for (const asset of allAssets) {
      const siteId = asset.siteId;
      let candidate: Anomaly | null = null;

      if (asset.assetType === "BATTERY_SYSTEM") {
        const setpoint = await controlIntents.findLatestBefore(tenantId, asset.id, setpointMetric!.id, new Date());
        if (setpoint) {
          const windowEnd = new Date(setpoint.timestamp.getTime() + GRACE_WINDOW_MS);
          const [charge, discharge] = await Promise.all([
            measurements.findEarliestInWindow(tenantId, asset.id, chargeMetric!.id, setpoint.timestamp, windowEnd),
            measurements.findEarliestInWindow(tenantId, asset.id, dischargeMetric!.id, setpoint.timestamp, windowEnd),
          ]);
          if (charge && discharge) {
            const candidateResult = evaluateSetpointTracking({
              assetId: asset.id,
              ruleKey: "BATTERY_SETPOINT_TRACKING_V1",
              setpoint: { value: setpoint.value, timestamp: setpoint.timestamp },
              actual: {
                value: normalizeBatteryActualPower(charge.value, discharge.value),
                timestamp: charge.timestamp,
              },
            });
            if (candidateResult) {
              candidate = await anomalies.insert({ tenantId, siteId, ...candidateResult });
            }
          }
        }
      } else if (asset.assetType === "PV_INVERTER") {
        const setpoint = await controlIntents.findLatestBefore(tenantId, asset.id, setpointMetric!.id, new Date());
        if (setpoint) {
          const windowEnd = new Date(setpoint.timestamp.getTime() + GRACE_WINDOW_MS);
          const actual = await measurements.findEarliestInWindow(
            tenantId,
            asset.id,
            generationMetric!.id,
            setpoint.timestamp,
            windowEnd,
          );
          if (actual) {
            const candidateResult = evaluateSetpointTracking({
              assetId: asset.id,
              ruleKey: "PV_SETPOINT_VS_ACTUAL_V1",
              setpoint: { value: setpoint.value, timestamp: setpoint.timestamp },
              actual: { value: actual.value, timestamp: actual.timestamp },
            });
            if (candidateResult) {
              candidate = await anomalies.insert({ tenantId, siteId, ...candidateResult });
            }
          }
        }
      } else {
        continue;
      }

      if (candidate) {
        anomalyCount += 1;
        const kase = await caseBuilder.buildFromAnomalies(tenantId, siteId, [candidate]);
        console.log(`ANOMALIE: ${asset.name} — ${candidate.ruleKey}`);
        console.log(`  ${candidate.description}`);
        console.log(`  Case: "${kase.title}" severity=${kase.severity} (${kase.id})`);
        console.log("");
      } else {
        console.log(`OK: ${asset.name} (${asset.assetType}) — kein Abweichungs-Alarm`);
      }
    }

    console.log("");
    console.log(`${allAssets.length} Assets geprueft, ${anomalyCount} Anomalie(n)/Case(s) erstellt.`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
