import type { AssetId, ComponentId, TenantId } from "../shared/ids.js";

/** Canonical Component Type Registry (docs/canonical-metrics.md). */
export const COMPONENT_TYPES = [
  "CHARGING_CONNECTOR",
  "PV_STRING",
  "MPPT",
  "DC_INPUT",
  "BATTERY_RACK",
  "BATTERY_MODULE",
  "VENDOR_COMPONENT",
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

/** Unterobjekt eines Assets — Asset, Component und MeasurementPoint sind getrennte Konzepte. */
export interface Component {
  readonly id: ComponentId;
  readonly tenantId: TenantId;
  readonly assetId: AssetId;
  readonly componentType: ComponentType;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
