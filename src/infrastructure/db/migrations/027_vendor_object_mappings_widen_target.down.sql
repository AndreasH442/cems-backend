ALTER TABLE vendor_object_mappings DROP CONSTRAINT vendor_object_mappings_check;
ALTER TABLE vendor_object_mappings ADD CONSTRAINT vendor_object_mappings_check CHECK (
  (mapping_status IN ('DISCOVERED', 'UNMAPPED', 'REJECTED') AND target_type IS NULL AND target_asset_id IS NULL)
  OR
  (mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED', 'VERIFIED') AND target_type = 'ASSET' AND target_asset_id IS NOT NULL)
);

DROP INDEX IF EXISTS vendor_object_mappings_target_component_id_idx;
DROP INDEX IF EXISTS vendor_object_mappings_target_measurement_point_id_idx;

ALTER TABLE vendor_object_mappings DROP CONSTRAINT vendor_object_mappings_target_component_id_fkey;
ALTER TABLE vendor_object_mappings DROP CONSTRAINT vendor_object_mappings_target_measurement_point_id_fkey;

ALTER TABLE vendor_object_mappings DROP COLUMN target_component_id;
ALTER TABLE vendor_object_mappings DROP COLUMN target_measurement_point_id;

ALTER TABLE vendor_object_mappings DROP CONSTRAINT vendor_object_mappings_target_type_check;
ALTER TABLE vendor_object_mappings ADD CONSTRAINT vendor_object_mappings_target_type_check CHECK (target_type IN ('ASSET'));
