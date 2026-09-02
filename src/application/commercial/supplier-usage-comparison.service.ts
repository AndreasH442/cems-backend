import { counterDiffKwh } from "../shared/measurement-window.js";
import type { AssetId, TenantId } from "../../domain/shared/ids.js";
import type { MeasurementRepository } from "../../infrastructure/repositories/measurement.repository.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";
import type { SupplierUsageReadingRepository } from "../../infrastructure/repositories/supplier-usage-reading.repository.js";

export interface SupplierUsageComparisonInput {
  readonly tenantId: TenantId;
  readonly gridConnectionAssetId: AssetId;
  readonly connectionReference: string;
  readonly from: Date;
  readonly to: Date;
}

export interface SupplierUsageComparisonResult {
  /** From the EMS (Wendeware) — energy_import_total counter diff. The authoritative figure. */
  readonly emsImportKwh: number;
  /** From the Scholt `usage` endpoint — informational only, never authoritative. */
  readonly supplierReportedKwh: number;
  readonly supplierReadingCount: number;
  readonly deltaKwh: number;
  readonly deltaPct: number | null;
}

/**
 * Compares the EMS-measured grid import against the supplier-reported usage for the same window
 * — a read-only diagnostic, never a correction. **The EMS is "the only true" source** (explicit
 * user decision, 02.09.2026): this service never writes anything back into the canonical
 * Measurement pipeline and is not wired into the Digital Auditor's anomaly registry — a
 * discrepancy here is informational (e.g. worth raising with the supplier), not a CEMS-side fault
 * to "fix".
 */
export class SupplierUsageComparisonService {
  constructor(
    private readonly deps: {
      readonly measurements: MeasurementRepository;
      readonly metricDefinitions: MetricDefinitionRepository;
      readonly supplierUsageReadings: SupplierUsageReadingRepository;
    },
  ) {}

  async compare(input: SupplierUsageComparisonInput): Promise<SupplierUsageComparisonResult> {
    const importMetric = await this.deps.metricDefinitions.findByKey("energy_import_total");
    if (!importMetric) {
      throw new Error("energy_import_total not seeded — run migrate:up first");
    }

    const emsRows = await this.deps.measurements.findAllInWindow(
      input.tenantId,
      importMetric.id,
      { assetId: input.gridConnectionAssetId },
      input.from,
      input.to,
    );
    const emsImportKwh = counterDiffKwh(emsRows);

    const supplierTotal = await this.deps.supplierUsageReadings.sumInWindow(
      input.tenantId,
      input.connectionReference,
      input.from,
      input.to,
    );

    const deltaKwh = supplierTotal.totalConVolume - emsImportKwh;
    const deltaPct = emsImportKwh !== 0 ? (deltaKwh / emsImportKwh) * 100 : null;

    return {
      emsImportKwh,
      supplierReportedKwh: supplierTotal.totalConVolume,
      supplierReadingCount: supplierTotal.readingCount,
      deltaKwh,
      deltaPct,
    };
  }
}
