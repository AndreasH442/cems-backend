CREATE TABLE connectors (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  site_id UUID,
  vendor_type TEXT NOT NULL CHECK (vendor_type IN ('WENDEWARE')),
  name TEXT NOT NULL,
  secret_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id)
);

CREATE INDEX connectors_tenant_id_idx ON connectors (tenant_id);
