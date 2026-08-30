CREATE TABLE vendor_object_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  connector_id UUID NOT NULL,
  vendor_object_id TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (
    mapping_status IN ('DISCOVERED', 'AUTO_MAPPED', 'MANUAL_MAPPED', 'VERIFIED', 'UNMAPPED', 'REJECTED')
  ),
  -- This slice only targets Asset (Component/MeasurementPoint don't exist yet); target_type
  -- is still modeled explicitly so a later slice can add target_component_id /
  -- target_measurement_point_id without reshaping this column.
  target_type TEXT CHECK (target_type IN ('ASSET')),
  target_asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connector_id, vendor_object_id),
  FOREIGN KEY (tenant_id, connector_id) REFERENCES connectors (tenant_id, id),
  FOREIGN KEY (tenant_id, target_asset_id) REFERENCES assets (tenant_id, id),
  -- DISCOVERED/UNMAPPED/REJECTED allow no target; the three "mapped" statuses require one
  -- (docs/domain-model.md, "UNMAPPED/DISCOVERED erlauben kein Ziel").
  CHECK (
    (mapping_status IN ('DISCOVERED', 'UNMAPPED', 'REJECTED') AND target_type IS NULL AND target_asset_id IS NULL)
    OR
    (mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED', 'VERIFIED') AND target_type = 'ASSET' AND target_asset_id IS NOT NULL)
  )
);

CREATE INDEX vendor_object_mappings_tenant_id_idx ON vendor_object_mappings (tenant_id);
CREATE INDEX vendor_object_mappings_connector_id_idx ON vendor_object_mappings (tenant_id, connector_id);
CREATE INDEX vendor_object_mappings_target_asset_id_idx ON vendor_object_mappings (tenant_id, target_asset_id);
