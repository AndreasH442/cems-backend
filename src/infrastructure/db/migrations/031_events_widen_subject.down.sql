DROP INDEX IF EXISTS events_component_type_time_idx;
DROP INDEX IF EXISTS events_mp_type_time_idx;

ALTER TABLE events DROP CONSTRAINT events_check;
ALTER TABLE events ADD CONSTRAINT events_check CHECK (
  (subject_type = 'SITE' AND site_id IS NOT NULL AND asset_id IS NULL)
  OR
  (subject_type = 'ASSET' AND asset_id IS NOT NULL AND site_id IS NULL)
);

ALTER TABLE events DROP CONSTRAINT events_component_id_fkey;
ALTER TABLE events DROP CONSTRAINT events_measurement_point_id_fkey;
ALTER TABLE events DROP COLUMN component_id;
ALTER TABLE events DROP COLUMN measurement_point_id;

ALTER TABLE events DROP CONSTRAINT events_subject_type_check;
ALTER TABLE events ADD CONSTRAINT events_subject_type_check CHECK (subject_type IN ('SITE', 'ASSET'));
