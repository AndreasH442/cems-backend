-- Multi-year retention for the digital auditor's training data (docs/decisions/ADR-011): compress
-- old chunks on measurements/control_intents, never delete them. Compression, not retention —
-- retention would actively drop old data, which is the opposite of what training needs.
--
-- segmentby = (tenant_id, metric_definition_id): matches the most common query shape (one tenant,
-- one metric, over a time range — see the existing *_metric_time_idx indexes) without fragmenting
-- into too many tiny segments across the three mutually-exclusive subject columns
-- (asset_id/component_id/measurement_point_id).
-- orderby = timestamp DESC: matches the ingest/query pattern of reading the most recent data first.
--
-- 30 days before compression: comfortably wider than the live connector's lookback/upsert window
-- (minutes to a couple of hours, docs/data-requirements.md "Idempotenz-Empfehlung"), so upserts
-- never need to touch an already-compressed chunk.
ALTER TABLE measurements SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tenant_id, metric_definition_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('measurements', INTERVAL '30 days');

ALTER TABLE control_intents SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tenant_id, metric_definition_id',
  timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('control_intents', INTERVAL '30 days');
