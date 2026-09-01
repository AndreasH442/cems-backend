-- Needed to give the already-mapped LP-AC/LP-DC (Ladeinfrastruktur) MeasurementPoints an
-- instantaneous-power counterpart to energy_consumption_total (migration 032) — mirrors the
-- energy+power pairing already used for active_power_generation/energy_generation_total.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('active_power_consumption', 'POWER', 'kW', 'FLOAT', 'AVG', 0, NULL);
