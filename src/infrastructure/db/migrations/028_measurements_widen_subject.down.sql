DROP INDEX measurements_asset_metric_time_idx;
DROP INDEX IF EXISTS measurements_component_metric_time_idx;
DROP INDEX IF EXISTS measurements_mp_metric_time_idx;
CREATE INDEX measurements_asset_metric_time_idx ON measurements (tenant_id, asset_id, metric_definition_id, "timestamp" DESC);

ALTER TABLE measurements DROP CONSTRAINT measurements_subject_check;
ALTER TABLE measurements DROP COLUMN component_id;
ALTER TABLE measurements DROP COLUMN measurement_point_id;
ALTER TABLE measurements ALTER COLUMN asset_id SET NOT NULL;

ALTER TABLE measurements DROP CONSTRAINT measurements_subject_type_check;
ALTER TABLE measurements ADD CONSTRAINT measurements_subject_type_check CHECK (subject_type IN ('ASSET'));
