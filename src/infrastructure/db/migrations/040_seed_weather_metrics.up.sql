-- ENVIRONMENT metrics needed by the Open-Meteo connector (docs/data-requirements-open-meteo.md).
-- expected_active_power (PV_PERFORMANCE) is already seeded, migration 006 -- unchanged, this is
-- the derived output; these four are the raw weather inputs. humidity stays unseeded: Open-Meteo
-- variable not pulled (no MVP need), same "nur tatsaechlich benoetigte Keys" discipline as before.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('irradiance',          'ENVIRONMENT', 'W/m2', 'FLOAT', 'AVG', 0,    NULL),
  ('ambient_temperature', 'ENVIRONMENT', '°C',   'FLOAT', 'AVG', NULL, NULL),
  ('wind_speed',          'ENVIRONMENT', 'm/s',  'FLOAT', 'AVG', 0,    NULL),
  ('cloud_cover',         'ENVIRONMENT', '%',    'FLOAT', 'AVG', 0,    100);
