CREATE TABLE organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  name TEXT NOT NULL,
  parent_organization_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  -- ADR-006: composite tenant FK, also enforces "same tenant" for the parent.
  FOREIGN KEY (tenant_id, parent_organization_id) REFERENCES organizations (tenant_id, id)
);

CREATE INDEX organizations_tenant_id_idx ON organizations (tenant_id);
