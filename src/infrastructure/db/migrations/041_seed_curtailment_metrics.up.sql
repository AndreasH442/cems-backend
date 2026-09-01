-- Curtailment classification (application/curtailment): recoverable (Regelung, heilbar) vs.
-- structural (Design, nicht heilbar) — see classify-curtailment.ts for the formula. The generic
-- curtailment_power/curtailment_energy keys already listed in docs/canonical-metrics.md stay
-- unseeded: they don't capture the recoverable/structural split, which is the actual analytical
-- value here, so these two explicit keys were curated instead.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('curtailment_energy_recoverable', 'PV_PERFORMANCE', 'kWh', 'FLOAT', 'LAST', 0, NULL),
  ('curtailment_energy_structural',  'PV_PERFORMANCE', 'kWh', 'FLOAT', 'LAST', 0, NULL);
