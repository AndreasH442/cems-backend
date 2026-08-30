-- Asset XOR Component only — no MeasurementPoint (docs/domain-model.md: "nicht steuerbar").
ALTER TABLE control_intents DROP CONSTRAINT control_intents_subject_type_check;
ALTER TABLE control_intents ADD CONSTRAINT control_intents_subject_type_check
  CHECK (subject_type IN ('ASSET', 'COMPONENT'));

ALTER TABLE control_intents ALTER COLUMN asset_id DROP NOT NULL;
ALTER TABLE control_intents ADD COLUMN component_id UUID;

ALTER TABLE control_intents ADD CONSTRAINT control_intents_subject_check CHECK (
  (subject_type = 'ASSET' AND asset_id IS NOT NULL AND component_id IS NULL)
  OR (subject_type = 'COMPONENT' AND asset_id IS NULL AND component_id IS NOT NULL)
);

DROP INDEX control_intents_asset_metric_time_idx;
CREATE INDEX control_intents_asset_metric_time_idx ON control_intents (tenant_id, asset_id, metric_definition_id, "timestamp" DESC) WHERE asset_id IS NOT NULL;
CREATE INDEX control_intents_component_metric_time_idx ON control_intents (tenant_id, component_id, metric_definition_id, "timestamp" DESC) WHERE component_id IS NOT NULL;
