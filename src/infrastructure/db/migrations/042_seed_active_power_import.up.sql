-- Netzbezug (kW) am Netzanschluss — bereits in docs/canonical-metrics.md dokumentiert, aber bisher
-- nicht geseedet. Gebraucht fuer die Nulleinspeisungs-Compliance-Regel GRID_IMPORT_BUFFER_UNDERSHOOT_V1
-- (application/grid-compliance). Gleiches Muster wie Migration 034 (active_power_consumption).
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('active_power_import', 'POWER', 'kW', 'FLOAT', 'AVG', 0, NULL);
