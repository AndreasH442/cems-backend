-- Neuer Asset-Typ SUB_DISTRIBUTION (Unterverteiler) fuer die Digital-Zwilling-Stammdaten-Taxonomie
-- (ADR-013). Gleiches Muster wie Migration 039 (connectors_vendor_type_check widen).
ALTER TABLE assets DROP CONSTRAINT assets_asset_type_check;
ALTER TABLE assets ADD CONSTRAINT assets_asset_type_check CHECK (
  asset_type IN (
    'GRID_CONNECTION', 'PV_SYSTEM', 'PV_INVERTER', 'BATTERY_SYSTEM', 'BATTERY_INVERTER',
    'CHARGING_STATION', 'METER', 'LOAD', 'EMS', 'GENERATOR', 'TRANSFORMER', 'GENERIC_DEVICE',
    'SUB_DISTRIBUTION'
  )
);
