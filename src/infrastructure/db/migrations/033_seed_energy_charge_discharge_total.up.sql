-- Needed now that real battery meter sensors are being mapped. Already documented in
-- docs/canonical-metrics.md ("Kumulative Zählerstände"), same discipline as migrations 006/032.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('energy_charge_total',    'ENERGY', 'kWh', 'FLOAT', 'LAST', 0, NULL),
  ('energy_discharge_total', 'ENERGY', 'kWh', 'FLOAT', 'LAST', 0, NULL);
