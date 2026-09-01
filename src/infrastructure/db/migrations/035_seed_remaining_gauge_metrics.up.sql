-- Needed for the remaining confirmed gauge sensor_type categories (docs/data-requirements.md):
-- battery_soh, battery_dc_voltage, battery_dc_current, battery_dc_power, battery_min_temperature
-- (battery_max_temperature already had temperature_max, migration 006), battery_reactive_power,
-- pv_reactive_power. Same "nur tatsächlich benötigte Keys" discipline as migration 006/032/033/034.
--
-- dc_current/dc_power/reactive_power are left unbounded (min/max NULL): unlike the setpoint-vs-actual
-- case (docs/data-requirements.md, confirmed by comparing two independent real measurements), there is
-- no second measurement to cross-check their sign convention against, so their real polarity meaning
-- (e.g. charge vs. discharge direction) is not confirmed — values are stored as reported, unclamped.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('state_of_health', 'BATTERY',    '%',   'FLOAT', 'LAST', 0, 100),
  ('temperature_min', 'THERMAL',    '°C',  'FLOAT', 'MIN',  NULL, NULL),
  ('dc_voltage',      'ELECTRICAL', 'V',   'FLOAT', 'AVG',  0, NULL),
  ('dc_current',      'ELECTRICAL', 'A',   'FLOAT', 'AVG',  NULL, NULL),
  ('dc_power',        'ELECTRICAL', 'kW',  'FLOAT', 'AVG',  NULL, NULL),
  ('reactive_power',  'ELECTRICAL', 'kVAr','FLOAT', 'AVG',  NULL, NULL);
