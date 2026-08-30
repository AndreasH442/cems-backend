DROP INDEX control_intents_asset_metric_time_idx;
DROP INDEX IF EXISTS control_intents_component_metric_time_idx;
CREATE INDEX control_intents_asset_metric_time_idx ON control_intents (tenant_id, asset_id, metric_definition_id, "timestamp" DESC);

ALTER TABLE control_intents DROP CONSTRAINT control_intents_subject_check;
ALTER TABLE control_intents DROP COLUMN component_id;
ALTER TABLE control_intents ALTER COLUMN asset_id SET NOT NULL;

ALTER TABLE control_intents DROP CONSTRAINT control_intents_subject_type_check;
ALTER TABLE control_intents ADD CONSTRAINT control_intents_subject_type_check CHECK (subject_type IN ('ASSET'));
