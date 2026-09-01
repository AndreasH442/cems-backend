-- grid_processed_price_eurocent (docs/data-requirements.md) is the price the EMS itself uses as
-- the basis for its own switching/optimization decisions — real values (01.09.2026) swing roughly
-- -0.1..21 ct/kWh over 48h, consistent with an hourly dynamic/spot tariff (negative prices included,
-- so deliberately unbounded). Canonical unit is EUR/kWh per docs/canonical-metrics.md's ECONOMIC
-- convention; the raw sensor reports €-ct, so VendorMetricMapping.unit_factor = 0.01 on ingestion.
INSERT INTO metric_definitions (key, category, canonical_unit, value_type, aggregation_method, min_value, max_value) VALUES
  ('grid_energy_price', 'ECONOMIC', 'EUR/kWh', 'FLOAT', 'LAST', NULL, NULL);
