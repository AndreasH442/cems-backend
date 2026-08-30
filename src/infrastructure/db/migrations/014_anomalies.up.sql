-- case_id is added later (see 022_anomalies_case_id.up.sql) once the cases table exists —
-- the CREATE order still follows docs/data-model.md, ADR-008 explains the FK's own direction.
CREATE TABLE anomalies (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  site_id UUID NOT NULL,
  asset_id UUID,
  rule_key TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  detected_at TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id)
);

CREATE INDEX anomalies_tenant_id_idx ON anomalies (tenant_id);
CREATE INDEX anomalies_site_id_idx ON anomalies (tenant_id, site_id);
CREATE INDEX anomalies_asset_id_idx ON anomalies (tenant_id, asset_id);
CREATE INDEX anomalies_rule_key_idx ON anomalies (rule_key);
