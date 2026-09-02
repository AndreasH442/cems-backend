import type { CaseBuilder } from "./case-builder.js";
import {
  type AnomalyCandidate,
  evaluateGenerationVsWeatherExpectation,
  evaluateGridExportLimitExceeded,
  evaluateGridImportBufferUndershoot,
  evaluateSetpointTracking,
  normalizeBatteryActualPower,
} from "./rules.js";
import { parseCurtailmentScopeConfiguration, type CurtailmentService } from "../curtailment/curtailment.service.js";
import type { GridComplianceService } from "../grid-compliance/grid-compliance.service.js";
import type { Anomaly, AuditorRuleKey } from "../../domain/auditor/anomaly.js";
import type { Asset, AssetType } from "../../domain/assets/asset.js";
import type { AssetId, CaseId, TenantId } from "../../domain/shared/ids.js";
import type { AnomalyRepository } from "../../infrastructure/repositories/anomaly.repository.js";
import type { AssetRepository } from "../../infrastructure/repositories/asset.repository.js";
import type { ControlIntentRepository } from "../../infrastructure/repositories/control-intent.repository.js";
import type { MeasurementRepository } from "../../infrastructure/repositories/measurement.repository.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";

const GRACE_WINDOW_MS = 60_000;

/**
 * "Baukasten" für den Digital Auditor (ADR-009-Folgeausbau): ein gemeinsames Rule-Interface statt
 * pro Regel eigener, unabhängig geschriebener Runner-Skripte. Gleiches Muster wie die bereits am
 * selben Piloten validierte Referenzimplementierung (energiecockpit: AnomalyDetectionService/
 * _Rule-Protocol) — jede Regel bleibt eigenständig (eigene I/O-Beschaffung, eigene reine
 * evaluate*-Funktion aus rules.ts), aber Discovery/Persistenz/Case-Bau passieren einmalig in
 * runAuditorForTenant statt pro Skript neu.
 *
 * PV_GENERATION_VS_WEATHER_V1 löst seine vier zusammengehörigen Asset-IDs (PV-Anlage, Netzanschluss,
 * Verbrauch, Site) über PV_SYSTEM.configuration auf (`parseCurtailmentScopeConfiguration`,
 * curtailment.service.ts) — explizite Referenzen statt Raten, gleiches Muster wie
 * SUB_DISTRIBUTION.configuration.circuits[].feedsAssetIds (ADR-013). scripts/curtailment-run.ts
 * bleibt trotzdem zusätzlich bestehen — es druckt die volle Tages-KPI-Aufschlüsselung auch ohne
 * Anomalie, echter Diagnose-Mehrwert über die Registry hinaus.
 *
 * MEASUREMENT_MISSING_WITH_HEARTBEAT_V1 ist weiterhin nicht registriert: braucht pro Asset eine
 * "welche Metrik/welches Fenster" -Konfiguration, die noch nirgends als Stammdatum existiert
 * (bleibt test-only, siehe test/integration/auditor-e2e.test.ts).
 */
export interface AuditorRuleContext {
  /** Für punktuelle Regeln (ControlIntent-Lookback) — "jetzt". */
  readonly now: Date;
  /** Für tagesbasierte Regeln (dayBounds) — ein beliebiger Zeitpunkt am zu prüfenden Tag. */
  readonly day: Date;
}

export interface AuditorRuleDeps {
  readonly assets: AssetRepository;
  readonly measurements: MeasurementRepository;
  readonly controlIntents: ControlIntentRepository;
  readonly metricDefinitions: MetricDefinitionRepository;
  readonly gridCompliance: GridComplianceService;
  readonly curtailmentService: CurtailmentService;
}

export interface AuditorRuleModule {
  readonly ruleKey: AuditorRuleKey;
  /** Welche Asset-Typen automatisch entdeckt und gegen diese Regel geprüft werden. */
  readonly targetAssetTypes: readonly AssetType[];
  run(
    deps: AuditorRuleDeps,
    tenantId: TenantId,
    asset: Asset,
    ctx: AuditorRuleContext,
  ): Promise<AnomalyCandidate | null>;
}

export const batterySetpointTrackingModule: AuditorRuleModule = {
  ruleKey: "BATTERY_SETPOINT_TRACKING_V1",
  targetAssetTypes: ["BATTERY_SYSTEM"],
  async run(deps, tenantId, asset, ctx) {
    const [setpointMetric, chargeMetric, dischargeMetric] = await Promise.all([
      deps.metricDefinitions.findByKey("active_power_setpoint"),
      deps.metricDefinitions.findByKey("active_power_charge"),
      deps.metricDefinitions.findByKey("active_power_discharge"),
    ]);
    const setpoint = await deps.controlIntents.findLatestBefore(tenantId, asset.id, setpointMetric!.id, ctx.now);
    if (!setpoint) return null;

    const windowEnd = new Date(setpoint.timestamp.getTime() + GRACE_WINDOW_MS);
    const [charge, discharge] = await Promise.all([
      deps.measurements.findEarliestInWindow(tenantId, asset.id, chargeMetric!.id, setpoint.timestamp, windowEnd),
      deps.measurements.findEarliestInWindow(tenantId, asset.id, dischargeMetric!.id, setpoint.timestamp, windowEnd),
    ]);
    if (!charge || !discharge) return null;

    const actualValue = normalizeBatteryActualPower(charge.value, discharge.value);
    const actualTimestamp = charge.timestamp > discharge.timestamp ? charge.timestamp : discharge.timestamp;
    return evaluateSetpointTracking({
      assetId: asset.id,
      ruleKey: "BATTERY_SETPOINT_TRACKING_V1",
      setpoint: { value: setpoint.value, timestamp: setpoint.timestamp },
      actual: { value: actualValue, timestamp: actualTimestamp },
    });
  },
};

export const pvSetpointVsActualModule: AuditorRuleModule = {
  ruleKey: "PV_SETPOINT_VS_ACTUAL_V1",
  targetAssetTypes: ["PV_INVERTER"],
  async run(deps, tenantId, asset, ctx) {
    const [setpointMetric, generationMetric] = await Promise.all([
      deps.metricDefinitions.findByKey("active_power_setpoint"),
      deps.metricDefinitions.findByKey("active_power_generation"),
    ]);
    const setpoint = await deps.controlIntents.findLatestBefore(tenantId, asset.id, setpointMetric!.id, ctx.now);
    if (!setpoint) return null;

    const windowEnd = new Date(setpoint.timestamp.getTime() + GRACE_WINDOW_MS);
    const actual = await deps.measurements.findEarliestInWindow(
      tenantId,
      asset.id,
      generationMetric!.id,
      setpoint.timestamp,
      windowEnd,
    );
    if (!actual) return null;

    return evaluateSetpointTracking({
      assetId: asset.id,
      ruleKey: "PV_SETPOINT_VS_ACTUAL_V1",
      setpoint: { value: setpoint.value, timestamp: setpoint.timestamp },
      actual: { value: actual.value, timestamp: actual.timestamp },
    });
  },
};

export const gridImportBufferUndershootModule: AuditorRuleModule = {
  ruleKey: "GRID_IMPORT_BUFFER_UNDERSHOOT_V1",
  targetAssetTypes: ["GRID_CONNECTION"],
  async run(deps, tenantId, asset, ctx) {
    const result = await deps.gridCompliance.computeForDay({ tenantId, gridConnectionAssetId: asset.id, day: ctx.day });
    if (result.skipped || result.minImportKw === null) return null;
    return evaluateGridImportBufferUndershoot({
      assetId: asset.id,
      day: ctx.day,
      minImportKw: result.minImportKw,
      config: result.config!,
    });
  },
};

export const gridExportLimitExceededModule: AuditorRuleModule = {
  ruleKey: "GRID_EXPORT_LIMIT_EXCEEDED_V1",
  targetAssetTypes: ["GRID_CONNECTION"],
  async run(deps, tenantId, asset, ctx) {
    const result = await deps.gridCompliance.computeForDay({ tenantId, gridConnectionAssetId: asset.id, day: ctx.day });
    if (result.skipped) return null;
    return evaluateGridExportLimitExceeded({
      assetId: asset.id,
      day: ctx.day,
      exportKwh: result.exportKwh!,
      config: result.config!,
    });
  },
};

export const pvGenerationVsWeatherModule: AuditorRuleModule = {
  ruleKey: "PV_GENERATION_VS_WEATHER_V1",
  targetAssetTypes: ["PV_SYSTEM"],
  async run(deps, tenantId, asset, ctx) {
    const scope = parseCurtailmentScopeConfiguration(asset.configuration);
    if (!scope) return null;

    const result = await deps.curtailmentService.computeForDay({
      tenantId,
      siteId: asset.siteId,
      pvSystemAssetId: asset.id,
      gridConnectionAssetId: scope.gridConnectionAssetId,
      userConsumptionAssetId: scope.userConsumptionAssetId,
      day: ctx.day,
    });
    if (result.skipped || !result.classification) return null;

    return evaluateGenerationVsWeatherExpectation({ assetId: asset.id, day: ctx.day, result });
  },
};

export const AUDITOR_RULE_MODULES: readonly AuditorRuleModule[] = [
  batterySetpointTrackingModule,
  pvSetpointVsActualModule,
  gridImportBufferUndershootModule,
  gridExportLimitExceededModule,
  pvGenerationVsWeatherModule,
];

export interface AuditorAssetResult {
  readonly asset: Asset;
  readonly anomalies: readonly Anomaly[];
  readonly caseId: CaseId;
}

/**
 * Discovers assets by type per registered module, runs each module, persists firing anomalies,
 * and builds exactly one Case per asset with ≥1 firing anomaly (bundling all of that asset's
 * rule hits into one Case, same behaviour scripts/grid-compliance-run.ts already had for its two
 * rules).
 */
export async function runAuditorForTenant(
  deps: AuditorRuleDeps & { readonly anomalies: AnomalyRepository; readonly caseBuilder: CaseBuilder },
  tenantId: TenantId,
  ctx: AuditorRuleContext,
): Promise<AuditorAssetResult[]> {
  const anomaliesByAsset = new Map<AssetId, { asset: Asset; anomalies: Anomaly[] }>();

  for (const module of AUDITOR_RULE_MODULES) {
    const assetsByType = await Promise.all(
      module.targetAssetTypes.map((type) => deps.assets.findByTenantAndType(tenantId, type)),
    );
    for (const asset of assetsByType.flat()) {
      const candidate = await module.run(deps, tenantId, asset, ctx);
      if (!candidate) continue;

      const anomaly = await deps.anomalies.insert({ tenantId, siteId: asset.siteId, ...candidate });
      const entry = anomaliesByAsset.get(asset.id) ?? { asset, anomalies: [] };
      entry.anomalies.push(anomaly);
      anomaliesByAsset.set(asset.id, entry);
    }
  }

  const results: AuditorAssetResult[] = [];
  for (const { asset, anomalies } of anomaliesByAsset.values()) {
    const kase = await deps.caseBuilder.buildFromAnomalies(tenantId, asset.siteId, anomalies);
    results.push({ asset, anomalies, caseId: kase.id });
  }
  return results;
}
