ALTER TABLE vendor_object_mappings DROP CONSTRAINT vendor_object_mappings_target_type_check;
ALTER TABLE vendor_object_mappings ADD CONSTRAINT vendor_object_mappings_target_type_check
  CHECK (target_type IN ('ASSET', 'COMPONENT', 'MEASUREMENT_POINT'));

ALTER TABLE vendor_object_mappings ADD COLUMN target_component_id UUID;
ALTER TABLE vendor_object_mappings ADD COLUMN target_measurement_point_id UUID;

ALTER TABLE vendor_object_mappings
  ADD CONSTRAINT vendor_object_mappings_target_component_id_fkey
  FOREIGN KEY (tenant_id, target_component_id) REFERENCES components (tenant_id, id);
ALTER TABLE vendor_object_mappings
  ADD CONSTRAINT vendor_object_mappings_target_measurement_point_id_fkey
  FOREIGN KEY (tenant_id, target_measurement_point_id) REFERENCES measurement_points (tenant_id, id);

-- Replace the old 2-branch CHECK (unmapped / ASSET) with a 4-branch one.
ALTER TABLE vendor_object_mappings DROP CONSTRAINT vendor_object_mappings_check;
ALTER TABLE vendor_object_mappings ADD CONSTRAINT vendor_object_mappings_check CHECK (
  (
    mapping_status IN ('DISCOVERED', 'UNMAPPED', 'REJECTED')
    AND target_type IS NULL AND target_asset_id IS NULL AND target_component_id IS NULL AND target_measurement_point_id IS NULL
  )
  OR (
    mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED', 'VERIFIED') AND target_type = 'ASSET'
    AND target_asset_id IS NOT NULL AND target_component_id IS NULL AND target_measurement_point_id IS NULL
  )
  OR (
    mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED', 'VERIFIED') AND target_type = 'COMPONENT'
    AND target_asset_id IS NULL AND target_component_id IS NOT NULL AND target_measurement_point_id IS NULL
  )
  OR (
    mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED', 'VERIFIED') AND target_type = 'MEASUREMENT_POINT'
    AND target_asset_id IS NULL AND target_component_id IS NULL AND target_measurement_point_id IS NOT NULL
  )
);

CREATE INDEX vendor_object_mappings_target_component_id_idx ON vendor_object_mappings (tenant_id, target_component_id);
CREATE INDEX vendor_object_mappings_target_measurement_point_id_idx ON vendor_object_mappings (tenant_id, target_measurement_point_id);
