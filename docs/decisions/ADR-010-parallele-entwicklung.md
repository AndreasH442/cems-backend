# ADR-010 – Parallele Entwicklung von Backend-Slice und UI-Prototyp

**Datum:** 30.08.2026

**Entscheidung:** Backend-Vertical-Slice (dieses Repo) und UI-Prototyp (separates Repo/Track, Basis: CEMS UI/UX Implementation Brief) werden bewusst parallel statt sequenziell entwickelt, um beide Seiten frühzeitig gegeneinander testen zu können.

**Risiko:** Die UI-Mock-Typen können von den hier festgelegten Enums/Status-Werten abweichen (Case-Status, Severity, mapping_status, Data-Quality-Werte). `docs/domain-model.md`, `docs/canonical-metrics.md` und `docs/data-model.md` in diesem Repo sind die verbindliche Single Source of Truth, an die sich der UI-Track anpassen muss – nicht umgekehrt.
