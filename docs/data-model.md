# CEMS Data Model – Übersicht (Stand 30.08.2026)

Diese Datei fasst Tabellen, Beziehungen, Kardinalitäten und die Zeitreihen-/Tenant-Regeln zusammen. Die vollständige SQL-DDL steht im Referenzdokument CEMS_PostgreSQL_TimescaleDB_Schema (außerhalb dieses Repos) und wird von dort 1:1 in die Migrationen übernommen; diese Datei ersetzt nicht die DDL, sondern orientiert bei der Migrationsreihenfolge.

## Tabellenübersicht (erster Vertical Slice, siehe docs/first-vertical-slice.md für die genaue Teilmenge)

```text
tenants
organizations
sites

assets
components
measurement_points
asset_measurement_points
measurement_point_meters

metric_definitions

connectors
vendor_object_mappings
vendor_metric_mappings

measurements          (Hypertable)
control_intents       (Hypertable – punktuelle Zeitreihe, ADR-007)
asset_states
events

anomalies

cases
case_subjects
case_evidence
recommendations
actions
verifications
case_status_history
```

Bewusst nicht Teil dieses Schemas: forecasts, business_cases, scenarios, energy_pools, users/roles, audit_log (siehe docs/first-vertical-slice.md, "Nicht bauen").

## Kardinalitäten

```text
Tenant 1:n Organization
Organization 1:n Site

Site 1:n Asset
Asset 1:n Component
Site 1:n MeasurementPoint
Asset n:m MeasurementPoint (asset_measurement_points, zeitlich gültig)
MeasurementPoint n:m Meter (measurement_point_meters, zeitlich gültig)

Connector 1:n VendorObjectMapping
VendorObjectMapping 1:n VendorMetricMapping
VendorMetricMapping n:1 MetricDefinition

MetricDefinition 1:n Measurement / ControlIntent / Anomaly
Asset/Component/MeasurementPoint → Measurements
Asset/Component → ControlIntents (punktuelle Zeitreihe, wie Measurement)
Asset/Component → AssetStates
Site/Asset/Component/MeasurementPoint → Events

Anomaly n:1 Case (optional, case_id – Entscheidung 30.08.2026)
Site 1:n Case
Case 1:n CaseSubject / CaseEvidence / Recommendation / Action / CaseStatusHistory
Action 1:n Verification
Case 1:n Verification
```

## Tenant-Regeln (ADR-006)

- Fast jedes fachliche Objekt trägt eine direkte `tenant_id` (bewusst redundant, auch wenn über site_id ableitbar).
- Jede Tabelle mit tenant_id (außer den Hypertables measurements/control_intents) erhält zusätzlich eine zusammengesetzte FK `(tenant_id, x_id) → x(tenant_id, id)`, nicht nur eine einfache FK auf die ID. Das schließt Cross-Tenant-Verknüpfungen strukturell aus, nicht nur per Anwendungscode.
- Row-Level-Security-Policies werden erst unmittelbar vor einem echten Kundenpilotbetrieb aktiviert (siehe Referenzdokument, Abschnitt Row-Level Security). Bis dahin sind measurements/control_intents ausschließlich über Application-Layer-Prüfung beim Ingest geschützt.

## Zeitreihenmodell

- `measurements`: ein Subject (Asset XOR Component XOR MeasurementPoint), ein Wert, eine Quality, ein Zeitstempel. Hypertable auf `timestamp`.
- `control_intents`: punktuelle Zeitreihe wie measurements (ADR-007), Subject Asset XOR Component, Hypertable auf `timestamp`.
- Deduplication/Idempotenz für beide Hypertables: natürlicher Schlüssel ohne Value — `(tenant_id, connector_id, vendor_object_id, vendor_sensor_id, timestamp)` — mit Upsert/Last-Write-Wins, nicht ein wert-einschließender Hash.
- Kumulative Zählerstände (`*_total`) werden nicht wie Intervallenergie aufsummiert; Intervallenergie wird als Differenz zweier gültiger Zählerstände berechnet (siehe docs/canonical-metrics.md).
- Compression ist aktiv (ADR-011): Chunks werden 30 Tage nach ihrem Zeitfenster komprimiert, nie gelöscht (mehrjährige Historie für den Digital Auditor). Chunk-Größe und Continuous-Aggregate-Konfiguration bleiben bewusst offen, erst nach Lasttests festzulegen.
