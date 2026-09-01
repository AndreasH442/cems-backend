-- Needed now that the real Wendeware live connector pulls cumulative energy-meter counters
-- (Wh). Keys already documented in docs/canonical-metrics.md ("Kumulative Zählerstände"),
-- only the four actually needed by the current pull are seeded (same "nur tatsächlich
-- benötigte Keys" discipline as migration 006). Aggregation LAST — counters are never summed.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('energy_generation_total',  'ENERGY', 'kWh', 'FLOAT', 'LAST', 0, NULL),
  ('energy_export_total',      'ENERGY', 'kWh', 'FLOAT', 'LAST', 0, NULL),
  ('energy_import_total',      'ENERGY', 'kWh', 'FLOAT', 'LAST', 0, NULL),
  ('energy_consumption_total', 'ENERGY', 'kWh', 'FLOAT', 'LAST', 0, NULL);
