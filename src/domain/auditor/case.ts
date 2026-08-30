import type { CaseId, SiteId, TenantId } from "../shared/ids.js";

/** Hartkodierte Einstufung (docs/first-vertical-slice.md, "Nicht bauen") — kein Formel-Scoring. */
export const CASE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];

export const CASE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const ECONOMIC_IMPACT_QUALITIES = ["CALCULATED", "ESTIMATED"] as const;
export type EconomicImpactQuality = (typeof ECONOMIC_IMPACT_QUALITIES)[number];

/** Zentrales Operations-Objekt, site-gebunden. severity und status sind getrennte Konzepte. */
export interface Case {
  readonly id: CaseId;
  readonly tenantId: TenantId;
  readonly siteId: SiteId;
  readonly severity: CaseSeverity;
  readonly status: CaseStatus;
  readonly title: string;
  readonly description: string;
  /** Wirtschaftliche Werte sind nie MEASURED. */
  readonly economicImpactValue: number | null;
  readonly economicImpactQuality: EconomicImpactQuality | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
