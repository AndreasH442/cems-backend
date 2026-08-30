CREATE TABLE asset_measurement_points (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  asset_id UUID NOT NULL,
  measurement_point_id UUID NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('PRIMARY', 'INPUT', 'OUTPUT', 'AUXILIARY', 'AGGREGATE')),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id),
  FOREIGN KEY (tenant_id, measurement_point_id) REFERENCES measurement_points (tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX asset_measurement_points_asset_idx ON asset_measurement_points (tenant_id, asset_id);
CREATE INDEX asset_measurement_points_mp_idx ON asset_measurement_points (tenant_id, measurement_point_id);
