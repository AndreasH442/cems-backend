CREATE TABLE assets (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  site_id UUID NOT NULL,
  parent_asset_id UUID,
  asset_type TEXT NOT NULL CHECK (
    asset_type IN (
      'GRID_CONNECTION', 'PV_SYSTEM', 'PV_INVERTER', 'BATTERY_SYSTEM', 'BATTERY_INVERTER',
      'CHARGING_STATION', 'METER', 'LOAD', 'EMS', 'GENERATOR', 'TRANSFORMER', 'GENERIC_DEVICE'
    )
  ),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, site_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id),
  -- ADR-006 composite FK, and (via the 3-column unique above) enforces "same site" for the parent too.
  FOREIGN KEY (tenant_id, site_id, parent_asset_id) REFERENCES assets (tenant_id, site_id, id),
  CHECK (parent_asset_id IS NULL OR parent_asset_id <> id)
);

CREATE INDEX assets_tenant_id_idx ON assets (tenant_id);
CREATE INDEX assets_site_id_idx ON assets (tenant_id, site_id);
CREATE INDEX assets_parent_asset_id_idx ON assets (tenant_id, parent_asset_id);
