ALTER TABLE events DROP CONSTRAINT events_subject_type_check;
ALTER TABLE events ADD CONSTRAINT events_subject_type_check
  CHECK (subject_type IN ('SITE', 'ASSET', 'COMPONENT', 'MEASUREMENT_POINT'));

ALTER TABLE events ADD COLUMN component_id UUID;
ALTER TABLE events ADD COLUMN measurement_point_id UUID;
ALTER TABLE events ADD CONSTRAINT events_component_id_fkey
  FOREIGN KEY (tenant_id, component_id) REFERENCES components (tenant_id, id);
ALTER TABLE events ADD CONSTRAINT events_measurement_point_id_fkey
  FOREIGN KEY (tenant_id, measurement_point_id) REFERENCES measurement_points (tenant_id, id);

ALTER TABLE events DROP CONSTRAINT events_check;
ALTER TABLE events ADD CONSTRAINT events_check CHECK (
  (subject_type = 'SITE' AND site_id IS NOT NULL AND asset_id IS NULL AND component_id IS NULL AND measurement_point_id IS NULL)
  OR (subject_type = 'ASSET' AND asset_id IS NOT NULL AND site_id IS NULL AND component_id IS NULL AND measurement_point_id IS NULL)
  OR (subject_type = 'COMPONENT' AND component_id IS NOT NULL AND site_id IS NULL AND asset_id IS NULL AND measurement_point_id IS NULL)
  OR (subject_type = 'MEASUREMENT_POINT' AND measurement_point_id IS NOT NULL AND site_id IS NULL AND asset_id IS NULL AND component_id IS NULL)
);

CREATE INDEX events_component_type_time_idx ON events (tenant_id, component_id, event_type, occurred_at DESC);
CREATE INDEX events_mp_type_time_idx ON events (tenant_id, measurement_point_id, event_type, occurred_at DESC);
