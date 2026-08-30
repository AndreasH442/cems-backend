ALTER TABLE measurements DROP CONSTRAINT measurements_subject_type_check;
ALTER TABLE measurements ADD CONSTRAINT measurements_subject_type_check
  CHECK (subject_type IN ('ASSET', 'COMPONENT', 'MEASUREMENT_POINT'));

ALTER TABLE measurements ALTER COLUMN asset_id DROP NOT NULL;
ALTER TABLE measurements ADD COLUMN component_id UUID;
ALTER TABLE measurements ADD COLUMN measurement_point_id UUID;

-- No FK here either (same ADR-006 hypertable exception as asset_id already has).
ALTER TABLE measurements ADD CONSTRAINT measurements_subject_check CHECK (
  (subject_type = 'ASSET' AND asset_id IS NOT NULL AND component_id IS NULL AND measurement_point_id IS NULL)
  OR (subject_type = 'COMPONENT' AND asset_id IS NULL AND component_id IS NOT NULL AND measurement_point_id IS NULL)
  OR (subject_type = 'MEASUREMENT_POINT' AND asset_id IS NULL AND component_id IS NULL AND measurement_point_id IS NOT NULL)
);

DROP INDEX measurements_asset_metric_time_idx;
CREATE INDEX measurements_asset_metric_time_idx ON measurements (tenant_id, asset_id, metric_definition_id, "timestamp" DESC) WHERE asset_id IS NOT NULL;
CREATE INDEX measurements_component_metric_time_idx ON measurements (tenant_id, component_id, metric_definition_id, "timestamp" DESC) WHERE component_id IS NOT NULL;
CREATE INDEX measurements_mp_metric_time_idx ON measurements (tenant_id, measurement_point_id, metric_definition_id, "timestamp" DESC) WHERE measurement_point_id IS NOT NULL;
