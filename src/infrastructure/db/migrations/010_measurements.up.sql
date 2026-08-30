-- Hypertable. Per ADR-006: no classical FKs on this table (ingest performance, tenant
-- isolation enforced at the application layer until RLS is activated pre-pilot).
CREATE TABLE measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'ASSET' CHECK (subject_type IN ('ASSET')),
  asset_id UUID NOT NULL,
  metric_definition_id UUID NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  quality TEXT NOT NULL CHECK (quality IN ('MEASURED', 'CALCULATED', 'ESTIMATED', 'SUBSTITUTED', 'INVALID')),
  -- Null when not sourced from a vendor ingest (e.g. quality=CALCULATED, computed by CEMS itself).
  connector_id UUID,
  vendor_object_id TEXT,
  vendor_sensor_id TEXT,
  PRIMARY KEY (id, "timestamp")
);

SELECT create_hypertable('measurements', 'timestamp');

-- Idempotency / upsert key from docs/data-model.md: natural key without the value, only
-- meaningful (and enforceable as NOT NULL-safe) for vendor-sourced rows.
CREATE UNIQUE INDEX measurements_ingest_dedup_idx ON measurements (
  tenant_id, connector_id, vendor_object_id, vendor_sensor_id, "timestamp"
) WHERE connector_id IS NOT NULL;

CREATE INDEX measurements_asset_metric_time_idx ON measurements (tenant_id, asset_id, metric_definition_id, "timestamp" DESC);
