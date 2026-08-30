CREATE TABLE verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  case_id UUID NOT NULL,
  action_id UUID NOT NULL,
  result TEXT NOT NULL CHECK (
    result IN ('SUCCESS', 'PARTIAL_SUCCESS', 'NO_EFFECT', 'NEGATIVE_EFFECT', 'INCONCLUSIVE')
  ),
  verified_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES cases (tenant_id, id),
  FOREIGN KEY (tenant_id, action_id) REFERENCES actions (tenant_id, id)
);

CREATE INDEX verifications_case_id_idx ON verifications (tenant_id, case_id);
CREATE INDEX verifications_action_id_idx ON verifications (tenant_id, action_id);
