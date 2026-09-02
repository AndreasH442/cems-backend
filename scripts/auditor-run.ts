/**
 * Unified Digital-Auditor run: discovers assets by type per registered rule module
 * (application/auditor/rule-registry.ts) and runs all of them for a tenant in one pass — replaces
 * the previous scripts/live-run-auditor.ts (Battery/PV setpoint) and scripts/grid-compliance-run.ts
 * (Nulleinspeisung), which each hand-wired their own asset discovery and case-building.
 *
 * PV_GENERATION_VS_WEATHER_V1 is NOT covered here — it needs four coordinated asset IDs with no
 * modelled domain relation between them (see rule-registry.ts doc comment) — use
 * scripts/curtailment-run.ts for that.
 *
 * Usage:
 *   npm run auditor:run -- <tenantId> [dayISO]
 *   (dayISO defaults to yesterday, UTC — used only by the day-based grid-compliance rules)
 */
import { CaseBuilder } from "../src/application/auditor/case-builder.js";
import { runAuditorForTenant } from "../src/application/auditor/rule-registry.js";
import { GridComplianceService } from "../src/application/grid-compliance/grid-compliance.service.js";
import type { TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
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

function yesterday(now: Date): Date {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  const [tenantIdArg, dayArg] = process.argv.slice(2);
  if (!tenantIdArg) {
    console.error("Usage: npm run auditor:run -- <tenantId> [dayISO]");
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;
  const now = new Date();
  const day = dayArg ? new Date(`${dayArg}T00:00:00.000Z`) : yesterday(now);
  if (Number.isNaN(day.getTime())) {
    console.error(`Invalid day: "${dayArg}"`);
    process.exitCode = 1;
    return;
  }

  const pool = createPool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL });
  const db = createDb(pool);

  try {
    const assets = new AssetRepository(db);
    const measurements = new MeasurementRepository(db);
    const controlIntents = new ControlIntentRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    const anomalies = new AnomalyRepository(db);
    const gridCompliance = new GridComplianceService({ assets, measurements, metricDefinitions });
    const caseBuilder = new CaseBuilder({
      cases: new CaseRepository(db),
      caseSubjects: new CaseSubjectRepository(db),
      caseEvidence: new CaseEvidenceRepository(db),
      caseStatusHistory: new CaseStatusHistoryRepository(db),
      anomalies,
    });

    console.log(`Auditor-Lauf fuer Tenant ${tenantId} (Tag ${day.toISOString().slice(0, 10)} fuer Tages-Regeln) ...`);
    console.log("");

    const results = await runAuditorForTenant(
      { assets, measurements, controlIntents, metricDefinitions, gridCompliance, anomalies, caseBuilder },
      tenantId,
      { now, day },
    );

    if (results.length === 0) {
      console.log("Keine Anomalien gefunden.");
    } else {
      for (const result of results) {
        console.log(`ANOMALIE(N) auf ${result.asset.name} (${result.asset.assetType}):`);
        for (const anomaly of result.anomalies) {
          console.log(`  [${anomaly.ruleKey}] ${anomaly.description}`);
        }
        console.log(`  Case: ${result.caseId}`);
        console.log("");
      }
    }
    console.log(`${results.length} Asset(s) mit Anomalie(n), Case(s) erstellt.`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
