-- Only the keys needed for this vertical slice (docs/first-vertical-slice.md).
-- availability_state is intentionally NOT here: it is an AssetState, not a Metric.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('state_of_charge',        'BATTERY', '%',  'FLOAT', 'LAST', 0, 100),
  ('active_power_setpoint',  'POWER',   'kW', 'FLOAT', 'LAST', NULL, NULL),
  ('active_power_charge',    'POWER',   'kW', 'FLOAT', 'AVG',  0, NULL),
  ('active_power_discharge', 'POWER',   'kW', 'FLOAT', 'AVG',  0, NULL),
  ('temperature_max',        'THERMAL', '°C', 'FLOAT', 'MAX',  NULL, NULL),
  ('active_power_generation','POWER',   'kW', 'FLOAT', 'AVG',  0, NULL),
  ('expected_active_power',  'PV_PERFORMANCE', 'kW', 'FLOAT', 'AVG', 0, NULL),
  ('device_temperature',     'SYSTEM_HEALTH',  '°C', 'FLOAT', 'AVG', NULL, NULL);
