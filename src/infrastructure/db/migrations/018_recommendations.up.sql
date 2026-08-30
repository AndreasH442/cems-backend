CREATE TABLE recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  case_id UUID NOT NULL,
  description TEXT NOT NULL,
  expected_impact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES cases (tenant_id, id)
);

CREATE INDEX recommendations_case_id_idx ON recommendations (tenant_id, case_id);
