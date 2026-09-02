-- Supplier-reported (offizieller Netzzaehler) Verbrauch aus der Scholt-usage-API. Bewusst
-- getrennt von measurements/den kanonischen energy_import/energy_export-Metriken -- das EMS
-- bleibt "the only true" (explizite Nutzerentscheidung, 02.09.2026), diese Tabelle ist ein reines
-- Vergleichssignal, das nie in die kanonische Zeitreihe geschrieben wird.
CREATE TABLE supplier_usage_readings (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  site_id UUID NOT NULL,
  asset_id UUID,
  connector_id UUID,
  connection_reference TEXT NOT NULL,
  utility_type TEXT NOT NULL CHECK (utility_type IN ('ele', 'gas')),
  interval TEXT NOT NULL CHECK (interval IN ('yearly', 'monthly', 'weekly', 'daily', 'hourly', 'quarterly')),
  bucket_start TIMESTAMPTZ NOT NULL,
  unit TEXT NOT NULL,
  con_volume DOUBLE PRECISION NOT NULL,
  con_volume_peak DOUBLE PRECISION,
  con_volume_offpeak DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  -- Idempotenter Import: derselbe Anschluss/Intervall/Bucket wird ueberschrieben, nicht dupliziert.
  UNIQUE (tenant_id, connection_reference, interval, bucket_start),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id),
  FOREIGN KEY (tenant_id, connector_id) REFERENCES connectors (tenant_id, id)
);

CREATE INDEX supplier_usage_readings_tenant_id_idx ON supplier_usage_readings (tenant_id);
CREATE INDEX supplier_usage_readings_site_id_idx ON supplier_usage_readings (tenant_id, site_id);
