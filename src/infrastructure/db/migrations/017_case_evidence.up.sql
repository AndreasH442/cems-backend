CREATE TABLE case_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  case_id UUID NOT NULL,
  evidence_type TEXT NOT NULL CHECK (
    evidence_type IN (
      'ANOMALY', 'EVENT', 'STATE', 'CONTROL_INTENT', 'FORECAST',
      'MEASUREMENT_WINDOW', 'DOCUMENT', 'MANUAL_NOTE'
    )
  ),
  -- Bewusst ohne FK: polymorph, ergänzend zur echten anomalies.case_id-FK (ADR-008), nicht deren Ersatz.
  reference_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (tenant_id, case_id) REFERENCES cases (tenant_id, id)
);

CREATE INDEX case_evidence_case_id_idx ON case_evidence (tenant_id, case_id);
