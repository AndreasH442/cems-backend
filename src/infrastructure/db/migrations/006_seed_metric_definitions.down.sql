DELETE FROM metric_definitions WHERE key IN (
  'state_of_charge', 'active_power_setpoint', 'active_power_charge', 'active_power_discharge',
  'temperature_max', 'active_power_generation', 'expected_active_power', 'device_temperature'
);
