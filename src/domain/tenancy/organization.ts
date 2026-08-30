import type { OrganizationId, TenantId } from "../shared/ids.js";

export interface Organization {
  readonly id: OrganizationId;
  readonly tenantId: TenantId;
  readonly name: string;
  /** Must belong to the same tenant, enforced by the composite FK (ADR-006). */
  readonly parentOrganizationId: OrganizationId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
