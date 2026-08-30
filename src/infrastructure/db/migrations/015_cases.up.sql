CREATE TABLE cases (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  site_id UUID NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  economic_impact_value DOUBLE PRECISION,
  economic_impact_quality TEXT CHECK (economic_impact_quality IN ('CALCULATED', 'ESTIMATED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id),
  -- Wirtschaftliche Werte sind nie MEASURED: either both set or neither.
  CHECK ((economic_impact_value IS NULL) = (economic_impact_quality IS NULL))
);

CREATE INDEX cases_tenant_id_idx ON cases (tenant_id);
CREATE INDEX cases_site_id_idx ON cases (tenant_id, site_id);
CREATE INDEX cases_status_idx ON cases (tenant_id, status);
