CREATE TABLE vendor_metric_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  vendor_object_mapping_id UUID NOT NULL,
  vendor_sensor_id TEXT NOT NULL,
  metric_definition_id UUID NOT NULL REFERENCES metric_definitions (id),
  unit_factor DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit_offset DOUBLE PRECISION NOT NULL DEFAULT 0,
  sign_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (sign_multiplier IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, vendor_object_mapping_id, vendor_sensor_id),
  FOREIGN KEY (tenant_id, vendor_object_mapping_id) REFERENCES vendor_object_mappings (tenant_id, id)
);

CREATE INDEX vendor_metric_mappings_tenant_id_idx ON vendor_metric_mappings (tenant_id);
CREATE INDEX vendor_metric_mappings_object_mapping_idx ON vendor_metric_mappings (tenant_id, vendor_object_mapping_id);
CREATE INDEX vendor_metric_mappings_metric_definition_idx ON vendor_metric_mappings (metric_definition_id);
