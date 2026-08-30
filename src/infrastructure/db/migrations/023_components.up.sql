CREATE TABLE components (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  asset_id UUID NOT NULL,
  component_type TEXT NOT NULL CHECK (
    component_type IN (
      'CHARGING_CONNECTOR', 'PV_STRING', 'MPPT', 'DC_INPUT', 'BATTERY_RACK', 'BATTERY_MODULE', 'VENDOR_COMPONENT'
    )
  ),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  -- Referenced by measurements/control_intents/asset_states/events/vendor_object_mappings.
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id)
);

CREATE INDEX components_tenant_id_idx ON components (tenant_id);
CREATE INDEX components_asset_id_idx ON components (tenant_id, asset_id);
