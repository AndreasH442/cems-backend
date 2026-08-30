CREATE TABLE case_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  case_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  PRIMARY KEY (id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES cases (tenant_id, id)
);

CREATE INDEX case_status_history_case_id_idx ON case_status_history (tenant_id, case_id, changed_at DESC);
