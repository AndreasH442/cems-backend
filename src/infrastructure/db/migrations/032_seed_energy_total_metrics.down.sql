DELETE FROM metric_definitions WHERE key IN (
  'energy_generation_total', 'energy_export_total', 'energy_import_total', 'energy_consumption_total'
);
