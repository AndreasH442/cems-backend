-- Not a hypertable (only measurements/control_intents are, per docs/data-model.md).
CREATE TABLE events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('SITE', 'ASSET')),
  site_id UUID,
  asset_id UUID,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id),
  CHECK (
    (subject_type = 'SITE' AND site_id IS NOT NULL AND asset_id IS NULL)
    OR
    (subject_type = 'ASSET' AND asset_id IS NOT NULL AND site_id IS NULL)
  )
);

CREATE INDEX events_tenant_id_idx ON events (tenant_id);
CREATE INDEX events_asset_type_time_idx ON events (tenant_id, asset_id, event_type, occurred_at DESC);
CREATE INDEX events_site_type_time_idx ON events (tenant_id, site_id, event_type, occurred_at DESC);
