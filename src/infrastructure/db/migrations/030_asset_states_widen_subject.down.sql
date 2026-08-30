DROP INDEX IF EXISTS asset_states_component_id_idx;
ALTER TABLE asset_states DROP CONSTRAINT asset_states_subject_check;
ALTER TABLE asset_states DROP CONSTRAINT asset_states_component_id_fkey;
ALTER TABLE asset_states DROP COLUMN component_id;
ALTER TABLE asset_states ALTER COLUMN asset_id SET NOT NULL;
ALTER TABLE asset_states DROP COLUMN subject_type;
