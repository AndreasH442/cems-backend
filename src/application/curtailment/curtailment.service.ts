import { classifyCurtailment, type CurtailmentClassification } from "./classify-curtailment.js";
import { counterDiffKwh, dayBounds } from "../shared/measurement-window.js";
import type { MeasurementIngestionService } from "../ingestion/measurement-ingestion.service.js";
import type { Measurement } from "../../domain/timeseries/measurement.js";
import type { AssetId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { AssetRepository } from "../../infrastructure/repositories/asset.repository.js";
import type { MeasurementPointRepository } from "../../infrastructure/repositories/measurement-point.repository.js";
import type { MeasurementRepository } from "../../infrastructure/repositories/measurement.repository.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";

export interface CurtailmentServiceDeps {
  readonly measurements: MeasurementRepository;
  readonly measurementPoints: MeasurementPointRepository;
  readonly assets: AssetRepository;
  readonly metricDefinitions: MetricDefinitionRepository;
  readonly measurementIngestion: MeasurementIngestionService;
}

export interface CurtailmentDayInput {
  readonly tenantId: TenantId;
  readonly siteId: SiteId;
  readonly pvSystemAssetId: AssetId;
  readonly gridConnectionAssetId: AssetId;
  readonly userConsumptionAssetId: AssetId;
  /** Any Date on the target calendar day — only the UTC year/month/day are used. */
  readonly day: Date;
}

export interface CurtailmentDayResult {
  readonly skipped: boolean;
  readonly skipReason: string | null;
  readonly actualPvKwh: number;
  readonly expectedPvKwh: number;
  readonly verbrauchKwh: number;
  readonly classification: CurtailmentClassification | null;
}

export interface CurtailmentScopeConfiguration {
  readonly gridConnectionAssetId: AssetId;
  readonly userConsumptionAssetId: AssetId;
}

/**
 * Reads which GRID_CONNECTION/LOAD assets belong to a PV_SYSTEM for curtailment purposes, from
 * PV_SYSTEM.configuration (ADR-012). `null` means not configured — the Auditor rule module
 * (application/auditor/rule-registry.ts) then skips this asset rather than guessing, same
 * "presence of configuration = activation" convention as parsePvSystemConfiguration/
 * parseZeroExportConfiguration. `siteId` is not stored here — it's already on the PV_SYSTEM
 * asset itself (Asset.siteId).
 */
export function parseCurtailmentScopeConfiguration(
  configuration: Record<string, unknown>,
): CurtailmentScopeConfiguration | null {
  const gridConnectionAssetId = configuration["gridConnectionAssetId"];
  const userConsumptionAssetId = configuration["userConsumptionAssetId"];
  if (typeof gridConnectionAssetId !== "string" || typeof userConsumptionAssetId !== "string") {
    return null;
  }
  return {
    gridConnectionAssetId: gridConnectionAssetId as AssetId,
    userConsumptionAssetId: userConsumptionAssetId as AssetId,
  };
}

/** Trapezoidal power (kW) -> energy (kWh) integration over the actual timestamps of the readings — robust to mixed resolutions (15-min forecast vs. 1h archive), no fixed slot-length assumption. */
function trapezoidalIntegrateKwh(rows: readonly Measurement[]): number {
  let kwh = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const curr = rows[i]!;
    const hours = (curr.timestamp.getTime() - prev.timestamp.getTime()) / (60 * 60 * 1000);
    kwh += ((prev.value + curr.value) / 2) * hours;
  }
  return kwh;
}

/**
 * Orchestrates the daily curtailment classification (classify-curtailment.ts) against real
 * ingested data: actual PV generation (counter diff across the PV_SYSTEM asset and its
 * PV_INVERTER children), site consumption (counter diff across the grid-export, general-
 * consumption, and every site MeasurementPoint's energy_consumption_total — the latter picks up
 * wallbox charge points automatically since only they carry that metric, no explicit ID list
 * needed), and the weather-derived expected_active_power (trapezoidal integration).
 *
 * Honesty over guessing (project-wide principle): if expected_active_power has fewer than two
 * points for the day (ERA5 lag, not pulled yet), the whole day is skipped — no Measurement is
 * written. A silent zero would be actively misleading for a modeled quantity CEMS itself
 * computes; missing actual-generation/consumption counter data, by contrast, contributes 0 to its
 * sum rather than skipping the day (documented simplification: real ingestion gaps are treated as
 * "nothing recorded", not blocked on).
 */
export class CurtailmentService {
  constructor(private readonly deps: CurtailmentServiceDeps) {}

  async computeForDay(input: CurtailmentDayInput): Promise<CurtailmentDayResult> {
    const { start, end } = dayBounds(input.day);

    const [generationMetric, consumptionMetric, exportMetric, expectedMetric] = await Promise.all([
      this.deps.metricDefinitions.findByKey("energy_generation_total"),
      this.deps.metricDefinitions.findByKey("energy_consumption_total"),
      this.deps.metricDefinitions.findByKey("energy_export_total"),
      this.deps.metricDefinitions.findByKey("expected_active_power"),
    ]);
    if (!generationMetric || !consumptionMetric || !exportMetric || !expectedMetric) {
      throw new Error("Required canonical metrics not seeded — run migrate:up first");
    }

    const expectedRows = await this.deps.measurements.findAllInWindow(
      input.tenantId,
      expectedMetric.id,
      { assetId: input.pvSystemAssetId },
      start,
      end,
    );
    if (expectedRows.length < 2) {
      return this.skip(
        `Not enough expected_active_power data for ${start.toISOString().slice(0, 10)} ` +
          `(${expectedRows.length} point(s)) — pull weather (forecast or archive) for this day first.`,
      );
    }
    const expectedPvKwh = trapezoidalIntegrateKwh(expectedRows);

    const children = await this.deps.assets.findByParent(input.tenantId, input.pvSystemAssetId);
    const generationAssetIds = [input.pvSystemAssetId, ...children.map((c) => c.id)];
    const generationDiffs = await Promise.all(
      generationAssetIds.map((assetId) =>
        this.deps.measurements
          .findAllInWindow(input.tenantId, generationMetric.id, { assetId }, start, end)
          .then(counterDiffKwh),
      ),
    );
    const actualPvKwh = generationDiffs.reduce((sum, kwh) => sum + kwh, 0);

    const wallboxPoints = await this.deps.measurementPoints.findBySite(input.tenantId, input.siteId);
    const wallboxDiffs = await Promise.all(
      wallboxPoints.map((mp) =>
        this.deps.measurements
          .findAllInWindow(input.tenantId, consumptionMetric.id, { measurementPointId: mp.id }, start, end)
          .then(counterDiffKwh),
      ),
    );
    const wallboxKwh = wallboxDiffs.reduce((sum, kwh) => sum + kwh, 0);

    const [userRows, exportRows] = await Promise.all([
      this.deps.measurements.findAllInWindow(
        input.tenantId,
        consumptionMetric.id,
        { assetId: input.userConsumptionAssetId },
        start,
        end,
      ),
      this.deps.measurements.findAllInWindow(
        input.tenantId,
        exportMetric.id,
        { assetId: input.gridConnectionAssetId },
        start,
        end,
      ),
    ]);
    const verbrauchKwh = wallboxKwh + counterDiffKwh(userRows) + counterDiffKwh(exportRows);

    const classification = classifyCurtailment(actualPvKwh, expectedPvKwh, verbrauchKwh);

    await this.writeResult(input.tenantId, input.pvSystemAssetId, end, classification);

    return { skipped: false, skipReason: null, actualPvKwh, expectedPvKwh, verbrauchKwh, classification };
  }

  /** Delete-then-insert: these CALCULATED values have no connector provenance to dedup on via upsert(), so re-running for the same day must not accumulate duplicates. */
  private async writeResult(
    tenantId: TenantId,
    pvSystemAssetId: AssetId,
    timestamp: Date,
    classification: CurtailmentClassification,
  ): Promise<void> {
    const [recoverableMetric, structuralMetric] = await Promise.all([
      this.deps.metricDefinitions.findByKey("curtailment_energy_recoverable"),
      this.deps.metricDefinitions.findByKey("curtailment_energy_structural"),
    ]);
    if (!recoverableMetric || !structuralMetric) {
      throw new Error("curtailment_energy_recoverable/structural not seeded — run migrate:up first");
    }

    await this.deps.measurements.deleteAt(tenantId, recoverableMetric.id, { assetId: pvSystemAssetId }, timestamp);
    await this.deps.measurementIngestion.ingest({
      tenantId,
      subjectType: "ASSET",
      assetId: pvSystemAssetId,
      componentId: null,
      measurementPointId: null,
      metricKey: "curtailment_energy_recoverable",
      timestamp,
      value: classification.regelungsGapKwh,
      quality: "CALCULATED",
    });

    await this.deps.measurements.deleteAt(tenantId, structuralMetric.id, { assetId: pvSystemAssetId }, timestamp);
    await this.deps.measurementIngestion.ingest({
      tenantId,
      subjectType: "ASSET",
      assetId: pvSystemAssetId,
      componentId: null,
      measurementPointId: null,
      metricKey: "curtailment_energy_structural",
      timestamp,
      value: classification.designGapKwh,
      quality: "CALCULATED",
    });
  }

  private skip(reason: string): CurtailmentDayResult {
    return {
      skipped: true,
      skipReason: reason,
      actualPvKwh: 0,
      expectedPvKwh: 0,
      verbrauchKwh: 0,
      classification: null,
    };
  }
}
