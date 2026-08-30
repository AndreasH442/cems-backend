-- Hypertable, same ADR-006 exception as measurements. Punktuelle Zeitreihe wie Measurement,
-- kein valid_from/valid_until (ADR-007). Keine quality-Spalte (ADR-003).
CREATE TABLE control_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'ASSET' CHECK (subject_type IN ('ASSET')),
  asset_id UUID NOT NULL,
  metric_definition_id UUID NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  connector_id UUID,
  vendor_object_id TEXT,
  vendor_sensor_id TEXT,
  PRIMARY KEY (id, "timestamp")
);

SELECT create_hypertable('control_intents', 'timestamp');

CREATE UNIQUE INDEX control_intents_ingest_dedup_idx ON control_intents (
  tenant_id, connector_id, vendor_object_id, vendor_sensor_id, "timestamp"
) WHERE connector_id IS NOT NULL;

CREATE INDEX control_intents_asset_metric_time_idx ON control_intents (tenant_id, asset_id, metric_definition_id, "timestamp" DESC);
