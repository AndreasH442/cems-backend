-- article_group ist bewusst TEXT ohne CHECK-Constraint (ADR-014) -- die Vendor-Doku selbst sagt,
-- weitere Gruppen koennen spaeter ergaenzt werden; ein hartes Enum wuerde die Ingestion an einer
-- unbekannten, aber gueltigen kuenftigen Gruppe blockieren.
CREATE TABLE energy_cost_statement_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  statement_id UUID NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  article_name TEXT NOT NULL,
  article_group TEXT NOT NULL,
  tax_percentage DOUBLE PRECISION,
  slice_from DOUBLE PRECISION,
  slice_to DOUBLE PRECISION,
  quantity DOUBLE PRECISION,
  unit_price DOUBLE PRECISION,
  amount DOUBLE PRECISION NOT NULL,
  tax_amount DOUBLE PRECISION,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  FOREIGN KEY (tenant_id, statement_id) REFERENCES energy_cost_statements (tenant_id, id)
);

CREATE INDEX energy_cost_statement_lines_statement_id_idx ON energy_cost_statement_lines (tenant_id, statement_id);
