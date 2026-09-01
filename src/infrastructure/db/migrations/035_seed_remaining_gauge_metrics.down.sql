DELETE FROM metric_definitions WHERE key IN
  ('state_of_health', 'temperature_min', 'dc_voltage', 'dc_current', 'dc_power', 'reactive_power');
