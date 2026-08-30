-- asset_states had no subject_type column yet (only asset_id NOT NULL). Adding it with a
-- DEFAULT backfills existing rows as 'ASSET', matching the only subject that existed so far.
ALTER TABLE asset_states ADD COLUMN subject_type TEXT NOT NULL DEFAULT 'ASSET'
  CHECK (subject_type IN ('ASSET', 'COMPONENT'));

ALTER TABLE asset_states ALTER COLUMN asset_id DROP NOT NULL;
ALTER TABLE asset_states ADD COLUMN component_id UUID;
ALTER TABLE asset_states ADD CONSTRAINT asset_states_component_id_fkey
  FOREIGN KEY (tenant_id, component_id) REFERENCES components (tenant_id, id);

ALTER TABLE asset_states ADD CONSTRAINT asset_states_subject_check CHECK (
  (subject_type = 'ASSET' AND asset_id IS NOT NULL AND component_id IS NULL)
  OR (subject_type = 'COMPONENT' AND asset_id IS NULL AND component_id IS NOT NULL)
);

CREATE INDEX asset_states_component_id_idx ON asset_states (tenant_id, component_id, category);
