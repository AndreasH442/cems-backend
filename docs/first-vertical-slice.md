# CEMS – Erster Vertical Slice (freigegeben 30.08.2026)

Dies ist der einzige aktuell freigegebene Implementierungsumfang. Alles andere (Frontend-Backend-Integration, Auth, RLS-Policies, Forecast, Business Case, Energy Pool, Billing, API-Schicht) ist ausdrücklich NICHT Teil dieses Slice.

Ziel-Story: Vendor Fixture → Mapping → Canonical Measurement → ControlIntent → Soll/Ist-Vergleich → Anomaly → Case → Action → Verification, exemplarisch an einer Batterie und einem PV-Inverter.

## Domain Objects

Tenant, Organization, Site, Asset (BATTERY_SYSTEM, PV_INVERTER, EMS), MetricDefinition (nur tatsächlich benötigte Keys, siehe unten), Connector (WENDEWARE), VendorObjectMapping, VendorMetricMapping, Measurement, ControlIntent, AssetState, Event, Anomaly, Case, CaseSubject, CaseEvidence, Recommendation, Action, Verification, CaseStatusHistory.

Bewusst NICHT Teil dieses Slice: Component, MeasurementPoint, AssetMeasurementPoint, MeasurementPointMeter (für die Battery-/PV-Setpoint-Story nicht nötig – erst relevant, sobald Messpunkt-Hierarchien wie LP-AC-01…15 gebraucht werden).

Benötigte MetricDefinition-Keys: state_of_charge, active_power_setpoint, active_power_charge, active_power_discharge, temperature_max, availability_state (als AssetState, nicht Metric), active_power_generation, expected_active_power, device_temperature (Heartbeat).

## Tabellen

tenants, organizations, sites, assets, metric_definitions, connectors, vendor_object_mappings, vendor_metric_mappings, measurements (Hypertable), control_intents (Hypertable, punktuelle Zeitreihe – ADR-007), asset_states, events, anomalies, cases, case_subjects, case_evidence, recommendations, actions, verifications, case_status_history.

Alle Tabellen mit tenant_id (außer measurements/control_intents) erhalten zusammengesetzte Tenant-FKs (ADR-006).

## Services

- MeasurementIngestionService
- ControlIntentIngestionService (punktuelle Zeitreihe, kein Interval-Close-Logic)
- AssetStateIngestionService (minimal – availability_state)
- EventIngestionService (für EMS-Heartbeats)
- WendewareMapper (rein fixture-basiert, kein Live-Client/Discovery-Poller)
- Auditor-Regeln (ADR-009, alle drei):
  1. BATTERY_SETPOINT_TRACKING_V1
  2. PV_SETPOINT_VS_ACTUAL_V1
  3. MEASUREMENT_MISSING_WITH_HEARTBEAT_V1
- CaseBuilder (Anomaly → Case, inkl. anomalies.case_id – ADR-008)
- einfache manuelle Action-/Verification-Erstellung (kein Recommendation-NLP, statischer Textbaustein reicht)

## Tests

Die vier bereits definierten End-to-End-Tests (einfacher SOC-Import; Setpoint gefolgt → keine Anomaly; Setpoint nicht gefolgt → Anomaly+Case; Action → Verification SUCCESS) sind die Basis-Akzeptanzkriterien, ergänzt um je einen E2E-Test für PV_SETPOINT_VS_ACTUAL_V1 und MEASUREMENT_MISSING_WITH_HEARTBEAT_V1. Dazu Unit-Tests (Unit-Konversion, Sign-Normalisierung, Setpoint-Vergleich) und ein Contract-Test für die Wendeware-SOC-Sensor-Zuordnung.

## UI-Screens

Keine im eigentlichen Sinn. Der UI-Prototyp läuft parallel auf Mock-Daten (ADR-010, separater Track). Für diesen Slice höchstens ein simpler, nicht gestalteter interner Debug-View auf Basis der echten Daten – kein Claude-Design-Screen, explizit als Wegwerf-Artefakt.

## Nicht bauen

Frontend-Backend-Integration, HTTP-API-Schicht (Beweis erfolgt über Integrationstests), reale Authentifizierung, RLS-Policies (erst vor Kundenpilotbetrieb – ADR-006), Forecast-Engine, Business-Case-/Plan-vs-Actual-Schema, Energy Pool, Fleet Live Monitoring, Billing, Mapping-Versionierungstabelle, Component/MeasurementPoint-Hierarchie, feingranulare Auditor-Modulstruktur (rules/detectors/evaluators/case_builder/verification als getrennte Ordner – für drei Regeln reichen 1-2 Dateien), automatische Case-Priorisierungsformel (hartkodierte Einstufung reicht).

---

## Startprompt für Claude Code

```text
You are implementing the first backend vertical slice for CEMS.

Before coding, read in this repo:
- README.md
- CLAUDE.md
- AGENTS.md
- docs/domain-model.md
- docs/canonical-metrics.md
- docs/data-model.md
- docs/data-requirements.md
- docs/decisions/ (all ADRs, especially ADR-006 through ADR-010)
- docs/first-vertical-slice.md (this file's scope is authoritative)

Treat those documents as the current source of truth. Do not invent domain
entities, canonical metrics, or vendor semantics beyond what is documented.

First produce, without writing implementation code yet:
1. proposed backend language/framework (docs/decisions/ADR-002 leaves this open)
2. repository skeleton (folders only)
3. migration plan for the tables listed in docs/first-vertical-slice.md,
   including the composite tenant-FK pattern from ADR-006
4. an implementation plan for the three auditor rules (ADR-009)

Do not implement Frontend, HTTP API, Auth, or RLS policies in this slice.

Wait for review of that plan before writing migrations or application code.
```
