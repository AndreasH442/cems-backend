-- Kostenaufstellung pro Anschluss/Zeitraum (Scholt-API costoverview), ADR-014. Kein Rechnungs-
-- Domain-Objekt -- die Vendor-API liefert keine Rechnungsnummer, nur eine periodische
-- Kostenaufstellung, daher "statement" statt "invoice" (Namenstreue zur Vendor-Terminologie).
--
-- period_month ist bewusst NOT NULL: die Vendor-API erlaubt zwar auch reine Jahresabfragen ohne
-- Monat, aber der Connector fragt immer pro Monat ab (deckungsgleich mit dem in der Vendor-Doku
-- gezeigten Beispiel `year=<year>&month=<month>`) -- vereinfacht den Idempotenz-Schluessel
-- erheblich (eine einfache UNIQUE-Constraint statt eines Ausdrucks-Index mit COALESCE fuer NULL).
CREATE TABLE energy_cost_statements (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  site_id UUID NOT NULL,
  asset_id UUID,
  connector_id UUID,
  supplier_client_reference TEXT NOT NULL,
  connection_reference TEXT NOT NULL,
  utility_type TEXT NOT NULL CHECK (utility_type IN ('ele', 'gas')),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  -- Idempotenter Import: derselbe Anschluss/Zeitraum wird ueberschrieben (Upsert), nicht dupliziert.
  UNIQUE (tenant_id, connection_reference, period_year, period_month),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES assets (tenant_id, id),
  FOREIGN KEY (tenant_id, connector_id) REFERENCES connectors (tenant_id, id)
);

CREATE INDEX energy_cost_statements_tenant_id_idx ON energy_cost_statements (tenant_id);
CREATE INDEX energy_cost_statements_site_id_idx ON energy_cost_statements (tenant_id, site_id);
