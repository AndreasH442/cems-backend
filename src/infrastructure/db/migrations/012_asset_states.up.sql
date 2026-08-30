-- Not a hypertable: normal tenant table, full composite FK (ADR-006).
CREATE TABLE asset_states (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  asset_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('AVAILABILITY', 'OPERATION', 'COMMUNICATION', 'HEALTH')),
  state_value TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE INDEX asset_states_tenant_id_idx ON asset_states (tenant_id);
CREATE INDEX asset_states_asset_id_idx ON asset_states (tenant_id, asset_id, category);
