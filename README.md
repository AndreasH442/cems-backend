# CEMS – Customer Energy Management Service-Layer

Herstellerunabhängige B2B-Plattform für den kontinuierlichen technischen und wirtschaftlichen Betrieb dezentraler Energiesysteme.

## Status (30.08.2026)

Architektur-Review abgeschlossen. Domain Model, Canonical Model, PostgreSQL/TimescaleDB-Schema und Migration & Repository Blueprint liegen konzeptionell vor; die Entscheidungen aus dem Review sind in `docs/decisions/` (ADR-001 bis ADR-010) festgehalten.

**Der erste Vertical Slice (docs/first-vertical-slice.md) ist implementiert und getestet:** TypeScript/Node.js, Domain-Typen, Repositories, der fixture-basierte WendewareMapper, alle drei Auditor-Regeln (ADR-009) sowie die volle Kette Anomaly → Case → Action → Verification.

**Zweiter Slice (Component/MeasurementPoint) ebenfalls umgesetzt:** die in `docs/domain-model.md` schon immer spezifizierten, im ersten Slice bewusst ausgelassenen Entities Component, MeasurementPoint, AssetMeasurementPoint, MeasurementPointMeter – inklusive Erweiterung von Measurement/ControlIntent/AssetState/Event/VendorObjectMapping auf die vollen XOR-Subject-Varianten (z. B. Measurement jetzt gegen Asset, Component oder MeasurementPoint wie LP-AC-01…15).

Insgesamt 32 Migrationen (`src/infrastructure/db/migrations/`, Up/Down verifiziert), 59 Tests grün (`npm run test:unit`, `npm run test:integration`) – siehe AGENTS.md für die Kommandos. Weiterhin **kein Frontend, keine HTTP-API-Schicht, kein Auth-System, keine RLS-Policies** (siehe "Nicht bauen" in docs/first-vertical-slice.md).

## Bevor hier Code entsteht

1. `CLAUDE.md` (Entwicklungsregeln) und `AGENTS.md` lesen.
2. `docs/vision.md`, `docs/domain-model.md`, `docs/canonical-metrics.md`, `docs/data-model.md`, `docs/data-requirements.md` lesen.
3. `docs/decisions/` (ADR-001 … ADR-010) lesen – dort stehen alle bereits getroffenen, verbindlichen Architekturentscheidungen.
4. `docs/first-vertical-slice.md` lesen – das ist der einzige aktuell freigegebene erste Implementierungsumfang, inklusive eines fertigen Startprompts.

## Nicht erfinden

- keine neuen Domain-Entities ohne Rücksprache (docs/domain-model.md ist abschließend für den ersten Slice)
- keine neuen Canonical Metrics ohne Eintrag in docs/canonical-metrics.md
- keine Wendeware-Semantik, die nicht in docs/data-requirements.md dokumentiert ist
- keine Frontend-Backend-Integration im ersten Slice (das UI läuft parallel auf Mock-Daten, ADR-010)
- kein Forecast, kein Business Case/Plan-vs-Actual-Schema, keine Energy-Pool-/Fleet-/Billing-Funktionalität
