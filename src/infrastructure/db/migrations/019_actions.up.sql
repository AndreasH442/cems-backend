CREATE TABLE actions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  case_id UUID NOT NULL,
  recommendation_id UUID,
  description TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES cases (tenant_id, id),
  FOREIGN KEY (tenant_id, recommendation_id) REFERENCES recommendations (tenant_id, id)
);

CREATE INDEX actions_case_id_idx ON actions (tenant_id, case_id);
