-- This slice only supports Asset subjects (Component/MeasurementPoint don't exist yet).
CREATE TABLE case_subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  case_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('AFFECTED', 'ROOT_CAUSE', 'CONTRIBUTING')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES cases (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id)
);

CREATE INDEX case_subjects_case_id_idx ON case_subjects (tenant_id, case_id);
