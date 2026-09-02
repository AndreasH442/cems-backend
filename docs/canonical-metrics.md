# CEMS Canonical Metric Registry (Stand 30.08.2026)

Neue Metrics entstehen nie automatisch durch einen Connector. Ein unbekannter Vendor-Sensor bleibt UNMAPPED, bis die Metric fachlich bewertet, dokumentiert, dieser Registry hinzugefügt, gemappt und getestet wurde.

## POWER

active_power_import, active_power_export, active_power_consumption, active_power_generation, active_power_charge, active_power_discharge, active_power_setpoint, active_power_limit, active_power_available, active_power_net (abgeleitet, kein Rohwert)

## ENERGY

Intervallenergie: energy_import, energy_export, energy_consumption, energy_generation, energy_charge, energy_discharge
Kumulative Zählerstände (`_total`): energy_import_total, energy_export_total, energy_consumption_total, energy_generation_total, energy_charge_total, energy_discharge_total

Intervallenergie aus kumulativen Zählerständen wird als Differenz zweier gültiger Zählerstände berechnet, nicht durch naives Aufsummieren (Zählerreset/-wechsel/Overflow/fehlende Werte beachten).

## BATTERY

state_of_charge, state_of_health, nominal_capacity, usable_capacity, available_capacity, cycle_count

## ELECTRICAL

reactive_power, apparent_power, power_factor, voltage, current, frequency, dc_power, dc_voltage, dc_current

## THERMAL

temperature, temperature_min, temperature_max, temperature_average

## PV / PERFORMANCE

expected_active_power (im MVP: Measurement mit quality=CALCULATED, kein Forecast-Objekt; wetterbasiert seit ADR-012), performance_ratio, curtailment_power, curtailment_energy

curtailment_energy_recoverable, curtailment_energy_structural (kWh; Regelungs- vs. Design-Curtailment, `src/application/curtailment/classify-curtailment.ts` — die generischen `curtailment_power`/`curtailment_energy` oben bleiben ungenutzt, da sie diese Unterscheidung nicht abbilden)

## ECONOMIC

energy_price, market_energy_price, supplier_energy_price, grid_energy_price, tax_energy_price, total_energy_price, feed_in_price
Interne Basiseinheit für Energiepreise: EUR/kWh.

## SYSTEM HEALTH

device_temperature, cpu_user_utilization, cpu_system_utilization, cpu_idle_utilization, memory_used, memory_total, storage_used, storage_total, swap_used, swap_total, inode_used, inode_total, uptime, system_load

## ENVIRONMENT

ambient_temperature, irradiance, cloud_cover, wind_speed, humidity

---

## Canonical Asset Type Registry

GRID_CONNECTION, PV_SYSTEM, PV_INVERTER, BATTERY_SYSTEM, BATTERY_INVERTER, CHARGING_STATION, METER, LOAD, EMS, GENERATOR, TRANSFORMER, GENERIC_DEVICE, SUB_DISTRIBUTION (Unterverteiler, ADR-013)

SITE ist übergeordnetes Domain-Objekt, kein gewöhnliches Asset.

## Canonical Component Type Registry

CHARGING_CONNECTOR, PV_STRING, MPPT, DC_INPUT, BATTERY_RACK, BATTERY_MODULE, VENDOR_COMPONENT

Für den ersten Wendeware-Connector primär: CHARGING_CONNECTOR, VENDOR_COMPONENT (konservativ).

## Data Quality (Measurement)

MEASURED, CALCULATED, ESTIMATED, SUBSTITUTED, INVALID — `MISSING` wird nicht als Datensatz persistiert, sondern zur Abfragezeit aus fehlenden Zeilen abgeleitet.

FORECAST und CONTROL_INTENT sind keine Quality-Werte, sondern eigene Canonical Data Types.
