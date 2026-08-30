import type { OrganizationId, SiteId, TenantId } from "../shared/ids.js";

export interface Site {
  readonly id: SiteId;
  readonly tenantId: TenantId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
