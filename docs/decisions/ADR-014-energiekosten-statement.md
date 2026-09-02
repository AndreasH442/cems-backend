# ADR-014 – Energiekosten-Statement: gezielte Revision von "Billing: Nicht bauen"

**Datum:** 02.09.2026

## Entscheidung 1: Billing wird gezielt und eng geöffnet

`docs/first-vertical-slice.md` listet "Billing" explizit unter "Nicht bauen". Diese Einschränkung wird — analog zu ADR-012, das die "kein wetterbasiertes Forecast"-Regel gezielt aufgehoben hat, nicht pauschal — eng revidiert: erlaubt ist **strukturiertes Einlesen/Speichern real ausgestellter Kostenaufstellungen** einer echten, vom Nutzer bereitgestellten Energieanbieter-API (`https://scholt.app/secapi`). **Weiterhin nicht Teil davon:** Zahlungsabwicklung/Zahlungsstatus-Workflow, automatische Rechnungserstellung, Plan-vs-Actual-Schema, PDF-Upload/OCR (eigenes, größeres, separat besprochenes Thema: allgemeine Dokumentenverwaltung).

## Entscheidung 2: `EnergyCostStatement`, nicht "Invoice"

Der Endpunkt `costoverview` der Vendor-API liefert keine ausgestellte Rechnung mit Rechnungsnummer, sondern eine Kostenaufstellung pro Anschluss/Jahr/Monat aus einzelnen Rechnungspositionen. Das Domain-Modell folgt der tatsächlichen Vendor-Terminologie (`EnergyCostStatement`/`EnergyCostStatementLine`) statt einer Überinterpretation als "Invoice" — reine Namenstreue zur bestätigten API, kein Rateergebnis (ADR-004-Geist auf Domain-Namensebene angewendet).

## Entscheidung 3: `article_group` bleibt TEXT, kein Enum

Die Vendor-Dokumentation nennt fünf aktuell bestätigte Werte (Energie, Energiebelasting, Overig, Netwerkkosten/overheidskosten, Certificaten), aber auch ausdrücklich: _"Weitere können später ergänzt werden."_ Ein hartes `CHECK`-Constraint würde eine künftige, heute unbekannte Gruppe an der Ingestion blockieren. `article_group` bleibt deshalb `TEXT` ohne Constraint — gleiche Vorsicht wie bei anderen offenen Vendor-Registrierungen in diesem Projekt (z. B. `mapping_status`, das dagegen bewusst geschlossen ist, weil es CEMS-eigene, nicht Vendor-Terminologie ist).

## Entscheidung 4: Nur Datenfundament + Connector, keine Rendering-Schicht

Der Nutzer möchte langfristig einen Kostenverlauf (mehrere Jahre) und eine Kostenzusammensetzung (nach `article_group`) grafisch darstellen. Dieser Slice liefert dafür die Aggregations-Bausteine (`EnergyCostStatementRepository.sumByYear`/`sumByArticleGroup`, reine SQL-Aggregation) — keine Chart-/Rendering-Schicht, da CEMS weiterhin kein Frontend hat (`docs/first-vertical-slice.md`). Visualisierung erfolgt bei Bedarf separat (z. B. als eigenständiges Artifact), nicht als Teil des Backend-Repos.

**Konsequenz:** Migrationen 044/045 (Tabellen), 046 (`vendor_type` erweitert um `SCHOLT`). `docs/data-requirements-scholt.md` dokumentiert die reale API-Mechanik. Neuer Connector `src/connectors/scholt/`.
