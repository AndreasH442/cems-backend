import type { MeasurementPointId, SiteId, TenantId } from "../shared/ids.js";

/**
 * Fachlicher Mess-/Bilanzpunkt (z. B. Netzübergabe, Produktion, Ladepark), unabhängig vom
 * physischen Messgerät. Kein Type-Enum dokumentiert — nur informelle Beispiele in
 * docs/domain-model.md, daher keins erfunden.
 */
export interface MeasurementPoint {
  readonly id: MeasurementPointId;
  readonly tenantId: TenantId;
  readonly siteId: SiteId;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
