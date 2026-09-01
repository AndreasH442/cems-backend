import type { OrganizationId, SiteId, TenantId } from "../shared/ids.js";

export interface Site {
  readonly id: SiteId;
  readonly tenantId: TenantId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  /** Digital-twin master data (ADR-012) — typed because used by virtually every site-level calculation. */
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** Generic site master-data container (ADR-012) — asset-type-specific data lives on Asset.configuration instead. */
  readonly configuration: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
