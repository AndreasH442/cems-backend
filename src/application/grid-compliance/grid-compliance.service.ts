import { parseZeroExportConfiguration, type ZeroExportConfiguration } from "../auditor/rules.js";
import { counterDiffKwh, dayBounds } from "../shared/measurement-window.js";
import type { AssetId, TenantId } from "../../domain/shared/ids.js";
import type { AssetRepository } from "../../infrastructure/repositories/asset.repository.js";
import type { MeasurementRepository } from "../../infrastructure/repositories/measurement.repository.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";

export interface GridComplianceServiceDeps {
  readonly assets: AssetRepository;
  readonly measurements: MeasurementRepository;
  readonly metricDefinitions: MetricDefinitionRepository;
}

export interface GridComplianceDayInput {
  readonly tenantId: TenantId;
  readonly gridConnectionAssetId: AssetId;
  /** Any Date on the target calendar day — only the UTC year/month/day are used. */
  readonly day: Date;
}

export interface GridComplianceDayResult {
  readonly skipped: boolean;
  readonly skipReason: string | null;
  /** null when no active_power_import readings exist in the window — not the same as 0 kW. */
  readonly minImportKw: number | null;
  readonly exportKwh: number | null;
  readonly config: ZeroExportConfiguration | null;
}

/**
 * Nulleinspeisungs-Compliance für ein GRID_CONNECTION-Asset: prüft, ob die Regelung den
 * konfigurierten Netzbezug-Puffer hält und die Einspeisung unter dem konfigurierten Schwellwert
 * bleibt (evaluateGridImportBufferUndershoot/evaluateGridExportLimitExceeded, auditor/rules.ts).
 * Bewusst getrennt von CurtailmentService — andere Fragestellung (Regelungs-Compliance vs.
 * Wetter-Erwartung), kein gemeinsames Datenobjekt, gleiche Trennung wie in der Referenz-
 * implementierung (energiecockpit: curtailment.py kennt kein hat_nulleinspeisung).
 *
 * Reiner Lesepfad — schreibt keine Measurement (anders als CurtailmentService), da hier nichts
 * "berechnet" wird, das später als Erwartungswert dienen könnte.
 */
export class GridComplianceService {
  constructor(private readonly deps: GridComplianceServiceDeps) {}

  async computeForDay(input: GridComplianceDayInput): Promise<GridComplianceDayResult> {
    const asset = await this.deps.assets.findById(input.tenantId, input.gridConnectionAssetId);
    if (!asset) {
      throw new Error(`Asset ${input.gridConnectionAssetId} not found`);
    }
    const config = parseZeroExportConfiguration(asset.configuration);
    if (!config) {
      return this.skip("Keine Nulleinspeisungs-Konfiguration für dieses GRID_CONNECTION-Asset gesetzt.");
    }

    const { start, end } = dayBounds(input.day);

    const [importMetric, exportMetric] = await Promise.all([
      this.deps.metricDefinitions.findByKey("active_power_import"),
      this.deps.metricDefinitions.findByKey("energy_export_total"),
    ]);
    if (!importMetric || !exportMetric) {
      throw new Error("Required canonical metrics not seeded — run migrate:up first");
    }

    const [importRows, exportRows] = await Promise.all([
      this.deps.measurements.findAllInWindow(
        input.tenantId,
        importMetric.id,
        { assetId: input.gridConnectionAssetId },
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

    const minImportKw = importRows.length > 0 ? Math.min(...importRows.map((r) => r.value)) : null;
    const exportKwh = counterDiffKwh(exportRows);

    return { skipped: false, skipReason: null, minImportKw, exportKwh, config };
  }

  private skip(reason: string): GridComplianceDayResult {
    return { skipped: true, skipReason: reason, minImportKw: null, exportKwh: null, config: null };
  }
}
