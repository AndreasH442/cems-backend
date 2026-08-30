-- "Genau ein Asset vom Typ METER" wird applikationsseitig geprüft (measurement-point-linking
-- service), nicht per DB-Constraint — die Exklusivität ist laut docs/domain-model.md
-- "perspektivisch", kein harter Constraint in diesem Slice.
CREATE TABLE measurement_point_meters (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  measurement_point_id UUID NOT NULL,
  meter_asset_id UUID NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (tenant_id, measurement_point_id) REFERENCES measurement_points (tenant_id, id),
  FOREIGN KEY (tenant_id, meter_asset_id) REFERENCES assets (tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX measurement_point_meters_mp_idx ON measurement_point_meters (tenant_id, measurement_point_id);
CREATE INDEX measurement_point_meters_meter_idx ON measurement_point_meters (tenant_id, meter_asset_id);
