CREATE TABLE measurement_points (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  site_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  -- Referenced by measurements/events/vendor_object_mappings/asset_measurement_points/measurement_point_meters.
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id)
);

CREATE INDEX measurement_points_tenant_id_idx ON measurement_points (tenant_id);
CREATE INDEX measurement_points_site_id_idx ON measurement_points (tenant_id, site_id);
