/**
 * Runs the Nulleinspeisungs-Compliance-Pruefung (application/grid-compliance) for one
 * GRID_CONNECTION asset and one day, prints the result, and builds a Case for every rule that
 * fires (GRID_IMPORT_BUFFER_UNDERSHOOT_V1 / GRID_EXPORT_LIMIT_EXCEEDED_V1), same as
 * scripts/curtailment-run.ts.
 *
 * Needs active_power_import data for that day already ingested and a Nulleinspeisungs-
 * Konfiguration (bufferKw/exportLimitKwh) auf dem GRID_CONNECTION-Asset gesetzt
 * (AssetRepository.updateConfiguration) — sonst wird der Tag uebersprungen.
 *
 * Usage:
 *   npm run grid-compliance:run -- <tenantId> <siteId> <gridConnectionAssetId> <dayISO>
 *   (dayISO e.g. 2026-08-31)
 */
import { CaseBuilder } from "../src/application/auditor/case-builder.js";
import {
  evaluateGridExportLimitExceeded,
  evaluateGridImportBufferUndershoot,
} from "../src/application/auditor/rules.js";
import { GridComplianceService } from "../src/application/grid-compliance/grid-compliance.service.js";
import type { Anomaly } from "../src/domain/auditor/anomaly.js";
import type { AssetId, SiteId, TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { AnomalyRepository } from "../src/infrastructure/repositories/anomaly.repository.js";
import { AssetRepository } from "../src/infrastructure/repositories/asset.repository.js";
import { CaseEvidenceRepository } from "../src/infrastructure/repositories/case-evidence.repository.js";
import { CaseStatusHistoryRepository } from "../src/infrastructure/repositories/case-status-history.repository.js";
import { CaseSubjectRepository } from "../src/infrastructure/repositories/case-subject.repository.js";
import { CaseRepository } from "../src/infrastructure/repositories/case.repository.js";
import { MeasurementRepository } from "../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../src/infrastructure/repositories/metric-definition.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";

async function main(): Promise<void> {
  const [tenantIdArg, siteIdArg, gridIdArg, dayArg] = process.argv.slice(2);
  if (!tenantIdArg || !siteIdArg || !gridIdArg || !dayArg) {
    console.error("Usage: npm run grid-compliance:run -- <tenantId> <siteId> <gridConnectionAssetId> <dayISO>");
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;
  const siteId = siteIdArg as SiteId;
  const gridConnectionAssetId = gridIdArg as AssetId;
  const day = new Date(`${dayArg}T00:00:00.000Z`);
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

    const result = await gridCompliance.computeForDay({ tenantId, gridConnectionAssetId, day });

    if (result.skipped) {
      console.log(`Uebersprungen: ${result.skipReason}`);
      return;
    }

    console.log(`Tag: ${dayArg}`);
    console.log(
      `  Netzbezug-Minimum: ${result.minImportKw === null ? "keine Messwerte" : `${result.minImportKw.toFixed(2)} kW`} ` +
        `(Puffer ${result.config!.bufferKw.toFixed(2)} kW)`,
    );
    console.log(
      `  Einspeisung:       ${result.exportKwh!.toFixed(2)} kWh (Schwellwert ${result.config!.exportLimitKwh.toFixed(2)} kWh)`,
    );

    const candidates: Anomaly[] = [];
    if (result.minImportKw !== null) {
      const bufferCandidate = evaluateGridImportBufferUndershoot({
        assetId: gridConnectionAssetId,
        day,
        minImportKw: result.minImportKw,
        config: result.config!,
      });
      if (bufferCandidate) candidates.push(await anomalies.insert({ tenantId, siteId, ...bufferCandidate }));
    }
    const exportCandidate = evaluateGridExportLimitExceeded({
      assetId: gridConnectionAssetId,
      day,
      exportKwh: result.exportKwh!,
      config: result.config!,
    });
    if (exportCandidate) candidates.push(await anomalies.insert({ tenantId, siteId, ...exportCandidate }));

    console.log("");
    if (candidates.length === 0) {
      console.log("Kein Anomalie-Schwellwert ueberschritten.");
    } else {
      const kase = await caseBuilder.buildFromAnomalies(tenantId, siteId, candidates);
      for (const candidate of candidates) {
        console.log(`ANOMALIE: ${candidate.description}`);
      }
      console.log(`Case: "${kase.title}" severity=${kase.severity} (${kase.id})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
