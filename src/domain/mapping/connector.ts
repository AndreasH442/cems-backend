import type { ConnectorId, SiteId, TenantId } from "../shared/ids.js";

/** Only vendors actually integrated (docs/data-requirements.md) may appear here. */
export const CONNECTOR_VENDOR_TYPES = ["WENDEWARE"] as const;
export type ConnectorVendorType = (typeof CONNECTOR_VENDOR_TYPES)[number];

export interface Connector {
  readonly id: ConnectorId;
  readonly tenantId: TenantId;
  readonly siteId: SiteId | null;
  readonly vendorType: ConnectorVendorType;
  readonly name: string;
  /** Never a plaintext credential — a reference into an external secret store. */
  readonly secretReference: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
