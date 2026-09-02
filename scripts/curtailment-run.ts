/**
 * Runs the daily curtailment classification (application/curtailment/curtailment.service.ts) for
 * one PV_SYSTEM asset and one day, prints the result (regelungs-/design-bedingter Anteil), and —
 * if the ADR-009-style auditor rule PV_GENERATION_VS_WEATHER_V1 fires — builds a real Case
 * (CaseBuilder), same as scripts/auditor-run.ts.
 *
 * Needs expected_active_power data for that day already ingested (weather:pull /
 * weather:pull-archive) and the PV_SYSTEM's PV_INVERTER children linked via parentAssetId.
 * Not covered by scripts/auditor-run.ts's rule registry — see
 * src/application/auditor/rule-registry.ts's doc comment for why.
 *
 * Usage:
 *   npm run curtailment:run -- <tenantId> <siteId> <pvSystemAssetId> <gridConnectionAssetId> <userConsumptionAssetId> <dayISO>
 *   (dayISO e.g. 2026-08-15)
 */
import { CaseBuilder } from "../src/application/auditor/case-builder.js";
import { evaluateGenerationVsWeatherExpectation } from "../src/application/auditor/rules.js";
import { CurtailmentService } from "../src/application/curtailment/curtailment.service.js";
import { MeasurementIngestionService } from "../src/application/ingestion/measurement-ingestion.service.js";
import type { AssetId, SiteId, TenantId } from "../src/domain/shared/ids.js";
import { createPool } from "../src/infrastructure/db/client.js";
import { createDb } from "../src/infrastructure/db/kysely.js";
import { AnomalyRepository } from "../src/infrastructure/repositories/anomaly.repository.js";
import { AssetRepository } from "../src/infrastructure/repositories/asset.repository.js";
import { CaseEvidenceRepository } from "../src/infrastructure/repositories/case-evidence.repository.js";
import { CaseStatusHistoryRepository } from "../src/infrastructure/repositories/case-status-history.repository.js";
import { CaseSubjectRepository } from "../src/infrastructure/repositories/case-subject.repository.js";
import { CaseRepository } from "../src/infrastructure/repositories/case.repository.js";
import { MeasurementPointRepository } from "../src/infrastructure/repositories/measurement-point.repository.js";
import { MeasurementRepository } from "../src/infrastructure/repositories/measurement.repository.js";
import { MetricDefinitionRepository } from "../src/infrastructure/repositories/metric-definition.repository.js";

const DEFAULT_DEV_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cems_dev";

async function main(): Promise<void> {
  const [tenantIdArg, siteIdArg, pvSystemIdArg, gridIdArg, userConsumptionIdArg, dayArg] = process.argv.slice(2);
  if (!tenantIdArg || !siteIdArg || !pvSystemIdArg || !gridIdArg || !userConsumptionIdArg || !dayArg) {
    console.error(
      "Usage: npm run curtailment:run -- <tenantId> <siteId> <pvSystemAssetId> <gridConnectionAssetId> <userConsumptionAssetId> <dayISO>",
    );
    process.exitCode = 1;
    return;
  }
  const tenantId = tenantIdArg as TenantId;
  const siteId = siteIdArg as SiteId;
  const pvSystemAssetId = pvSystemIdArg as AssetId;
  const gridConnectionAssetId = gridIdArg as AssetId;
  const userConsumptionAssetId = userConsumptionIdArg as AssetId;
  const day = new Date(`${dayArg}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) {
    console.error(`Invalid day: "${dayArg}"`);
    process.exitCode = 1;
    return;
  }

  const pool = createPool({ connectionString: process.env.DATABASE_URL ?? DEFAULT_DEV_DATABASE_URL });
  const db = createDb(pool);

  try {
    const measurements = new MeasurementRepository(db);
    const measurementPoints = new MeasurementPointRepository(db);
    const assets = new AssetRepository(db);
    const metricDefinitions = new MetricDefinitionRepository(db);
    const anomalies = new AnomalyRepository(db);

    const curtailment = new CurtailmentService({
      measurements,
      measurementPoints,
      assets,
      metricDefinitions,
      measurementIngestion: new MeasurementIngestionService(measurements, metricDefinitions),
    });
    const caseBuilder = new CaseBuilder({
      cases: new CaseRepository(db),
      caseSubjects: new CaseSubjectRepository(db),
      caseEvidence: new CaseEvidenceRepository(db),
      caseStatusHistory: new CaseStatusHistoryRepository(db),
      anomalies,
    });

    const result = await curtailment.computeForDay({
      tenantId,
      siteId,
      pvSystemAssetId,
      gridConnectionAssetId,
      userConsumptionAssetId,
      day,
    });

    if (result.skipped) {
      console.log(`Uebersprungen: ${result.skipReason}`);
      return;
    }

    console.log(`Tag: ${dayArg}`);
    console.log(`  Ist-Erzeugung:        ${result.actualPvKwh.toFixed(1)} kWh`);
    console.log(`  Erwartete Erzeugung:  ${result.expectedPvKwh.toFixed(1)} kWh (Basis: Open-Meteo + PV-Modell)`);
    console.log(`  Standort-Verbrauch:   ${result.verbrauchKwh.toFixed(1)} kWh (Wallbox + Allgemein + Einspeisung)`);
    console.log(`  Max. nutzbar:         ${result.classification!.maxUsableKwh.toFixed(1)} kWh`);
    console.log(`  Regelungsbedingt (heilbar): ${result.classification!.regelungsGapKwh.toFixed(1)} kWh`);
    console.log(`  Strukturell (nicht heilbar): ${result.classification!.designGapKwh.toFixed(1)} kWh`);

    const candidate = evaluateGenerationVsWeatherExpectation({ assetId: pvSystemAssetId, day, result });
    if (candidate) {
      const anomaly = await anomalies.insert({ tenantId, siteId, ...candidate });
      const kase = await caseBuilder.buildFromAnomalies(tenantId, siteId, [anomaly]);
      console.log("");
      console.log(`ANOMALIE: ${candidate.description}`);
      console.log(`Case: "${kase.title}" severity=${kase.severity} (${kase.id})`);
    } else {
      console.log("");
      console.log("Kein Anomalie-Schwellwert ueberschritten.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
