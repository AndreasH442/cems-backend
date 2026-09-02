# ADR-013 – Digital-Zwilling-Stammdaten-Taxonomie; neuer Asset-Typ SUB_DISTRIBUTION

**Datum:** 02.09.2026

## Entscheidung 1: Neuer Asset-Typ `SUB_DISTRIBUTION` (Unterverteiler)

Ein Unterverteiler (Sicherungsliste, eigener Standort, eigene Wartung) ist kein `Component` — `Component` hat kein `configuration`-Feld (nur `Asset`/`Site` seit ADR-012) und ist konzeptionell ein Unterobjekt genau eines Assets, während ein Unterverteiler mehrere nachgelagerte Assets/Stromkreise versorgt. Er passt strukturell zu `Asset` mit `parent_asset_id`-Hierarchie (gleiches Muster wie `PV_SYSTEM` → `PV_INVERTER`). Einzelne Sicherungen/Stromkreise werden nicht separat gemessen und bekommen deshalb kein eigenes Domain-Objekt, sondern ein strukturiertes Array in `SUB_DISTRIBUTION.configuration` (CLAUDE.md: "generisches JSON nur dort, wo das Schema es vorsieht").

## Entscheidung 2: Rechenrelevante vs. reine Dokumentationsfelder

Die Stammdaten-Taxonomie (`docs/master-data-schema.md`) dokumentiert pro Asset-Typ, welche Felder in `configuration` gehören. Nicht jedes dokumentierte Feld bekommt eine TypeScript-Parser-Funktion: nur Felder mit einem echten Konsumenten (aktuell ausschließlich `PvSystemConfiguration`, gelesen von der PV-Erwartungsberechnung) werden typisiert geparst und getestet. Für alle anderen Felder (Wechselrichter-Stammdaten, Batterie-Spezifikationen, LIS-Konfiguration, Unterverteiler-Sicherungen, Netzwerk-Angaben) ist die Taxonomie-Doku selbst die Quelle der Wahrheit — eine Parser-Funktion ohne Aufrufer wäre totes Gewicht (CLAUDE.md: keine Features über die Anforderung hinaus, keine Designs für hypothetische Anforderungen). Sobald eine künftige Regel oder ein künftiger Slice ein Feld tatsächlich braucht, entsteht der Parser in genau diesem Moment — mit demselben bereits etablierten Guard-Muster ("lieber nichts berechnen als raten", `parsePvSystemConfiguration`, `src/connectors/open-meteo/pv-model.ts`).

## Entscheidung 3: Netzwerk-/IP-Dokumentation vs. Credentials

IP-Adressen, VLAN, Zugriffsweg sind unkritische technische Dokumentation und dürfen als Klartext in `configuration` stehen. Tatsächliche Zugangsdaten (Passwörter, API-Keys, Zertifikate) folgen weiterhin ausschließlich der bereits etablierten `secret_reference`-Konvention (`Connector.secretReference`) — nie im Klartext im Schema, auch nicht als Teil einer `network`-Konfiguration.

**Konsequenz:** Migration fügt `SUB_DISTRIBUTION` zur `asset_type`-CHECK-Constraint hinzu. `docs/canonical-metrics.md` und `docs/domain-model.md` werden entsprechend ergänzt. Kein Pflege-UI/API (weiterhin `docs/first-vertical-slice.md`, "Nicht bauen").
