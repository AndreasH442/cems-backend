# Digital-Zwilling-Stammdaten-Schema (Stand 02.09.2026)

Geschwister-Dokument zu `docs/data-requirements.md` (dort: vendor-spezifische API-Mechanik) — hier: vendor-neutrale, kanonische Struktur der Stammdaten, die in `sites.configuration`/`assets.configuration` (ADR-012, JSONB) hinterlegt werden. Kein Schema-Change pro Feld — das Fundament (die JSONB-Spalte) existiert bereits; dieses Dokument beschreibt nur die vereinbarte Struktur darin.

**Zwei Kategorien je Feld** (ADR-013):

- **Rechenrelevant** – wird von einer Berechnung/Regel tatsächlich gelesen. Hat eine typisierte Parser-Funktion mit Guard ("lieber nichts berechnen als raten") und Unit-Tests.
- **Dokumentation** – nichts liest das Feld (noch), aber es soll trotzdem strukturiert erfasst werden (Wartung, Vor-Ort-Support, künftige Auswertungen). Kein Parser-Code, bis ein echter Konsument entsteht — dieses Dokument ist bis dahin die Quelle der Wahrheit für Feldnamen/Typen.

Alle Felder sind optional im Sinn von "JSONB-Key kann fehlen" — nichts hiervon ist auf DB-Ebene erzwungen. Rechenrelevante Felder werden von ihrer jeweiligen Parser-Funktion bei fehlenden Werten als "nicht berechenbar" behandelt (Ergebnis `null`, kein Fehler, keine Rateei).

## Site (`sites.configuration`)

`latitude`/`longitude` sind eigene, typisierte Spalten (nicht Teil von `configuration`, ADR-012).

| Feld          | Typ    | Kategorie                                                         |
| ------------- | ------ | ----------------------------------------------------------------- |
| `siteContact` | string | Dokumentation                                                     |
| `accessNotes` | string | Dokumentation (z. B. Zufahrt, Schlüssel, Ansprechpartner vor Ort) |

## PV_SYSTEM (`assets.configuration`)

Rechenrelevant, geparst von `parsePvSystemConfiguration` (`src/connectors/open-meteo/pv-model.ts`) — genutzt von der wetterbasierten PV-Erwartungsberechnung:

| Feld                 | Typ                                    | Kategorie                                               |
| -------------------- | -------------------------------------- | ------------------------------------------------------- |
| `nominalCapacityKwp` | number                                 | Rechenrelevant (Pflicht)                                |
| `acCapacityKw`       | number                                 | Rechenrelevant (Pflicht)                                |
| `tiltDegrees`        | number                                 | Rechenrelevant (Pflicht)                                |
| `azimuthDegrees`     | number                                 | Rechenrelevant (Pflicht, 0°=Süd, Open-Meteo-Konvention) |
| `dcAcRatio`          | number                                 | Dokumentation (optional, wird aktuell nicht gelesen)    |
| `mounting`           | string (z. B. "Aufdach", "Freifläche") | Dokumentation                                           |
| `shading`            | string (Freitext)                      | Dokumentation                                           |

Fehlt eines der vier Pflichtfelder oder hat den falschen Typ, liefert der Parser `null` — die PV-Erwartung wird für dieses Asset dann übersprungen, nicht geraten.

**Curtailment-Scope** (rechenrelevant, geparst von `parseCurtailmentScopeConfiguration`, `src/application/curtailment/curtailment.service.ts` — genutzt vom Auditor-Modul `pvGenerationVsWeatherModule`, `src/application/auditor/rule-registry.ts`): welche `GRID_CONNECTION`/`LOAD`-Assets zu dieser PV-Anlage für die Curtailment-Berechnung gehören. `siteId` wird nicht extra gespeichert (bereits auf dem Asset selbst). Gleiches Muster wie `SUB_DISTRIBUTION.configuration.circuits[].feedsAssetIds` (ADR-013) — Asset-IDs als String, kein FK-Constraint.

| Feld                     | Typ               | Kategorie      |
| ------------------------ | ----------------- | -------------- |
| `gridConnectionAssetId`  | string (Asset-ID) | Rechenrelevant |
| `userConsumptionAssetId` | string (Asset-ID) | Rechenrelevant |

Fehlt eines der beiden Felder, wird das PV_SYSTEM-Asset vom Auditor-Baukasten automatisch übersprungen (keine Curtailment-Prüfung für dieses Asset, kein Fehler).

## PV_INVERTER (`assets.configuration`)

Reine Dokumentation, kein Parser:

| Feld                | Typ                |
| ------------------- | ------------------ |
| `manufacturer`      | string             |
| `model`             | string             |
| `serialNumber`      | string             |
| `nominalPowerKw`    | number             |
| `commissioningDate` | string (ISO-Datum) |

## BATTERY_SYSTEM / BATTERY_INVERTER (`assets.configuration`)

Reine Dokumentation, kein Parser:

| Feld                  | Typ                             |
| --------------------- | ------------------------------- |
| `capacityKwh`         | number                          |
| `chemistry`           | string (z. B. "LFP")            |
| `maxChargePowerKw`    | number                          |
| `maxDischargePowerKw` | number                          |
| `cycleLifeGuarantee`  | number (garantierte Zyklenzahl) |

## CHARGING_STATION (LIS, `assets.configuration`)

Reine Dokumentation, kein Parser:

| Feld             | Typ          |
| ---------------- | ------------ |
| `chargingType`   | "AC" \| "DC" |
| `powerClassKw`   | number       |
| `connectorCount` | number       |
| `ocppVersion`    | string       |

## GRID_CONNECTION (`assets.configuration`)

`bufferKw`/`exportLimitKwh` sind bereits rechenrelevant und real im Einsatz (Slice 1, `parseZeroExportConfiguration`, `src/application/auditor/rules.ts`):

| Feld                 | Typ                           | Kategorie                                                                          |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `bufferKw`           | number                        | Rechenrelevant (Nulleinspeisungs-Compliance)                                       |
| `exportLimitKwh`     | number                        | Rechenrelevant (Nulleinspeisungs-Compliance)                                       |
| `contractedPowerKva` | number                        | Dokumentation (künftiges Rechenfeld für eine Lastspitzen-Regel, noch nicht gebaut) |
| `gridOperator`       | string                        | Dokumentation                                                                      |
| `meteringPointId`    | string (Zählpunktbezeichnung) | Dokumentation                                                                      |

## SUB_DISTRIBUTION (neu, ADR-013, `assets.configuration`)

Unterverteiler — eigener Asset-Typ, nicht Component (Begründung: ADR-013). Reine Dokumentation, kein Parser. Einzelne Sicherungen/Stromkreise sind kein eigenes Domain-Objekt (nicht individuell gemessen), sondern ein strukturiertes Array:

| Feld       | Typ                                                                 |
| ---------- | ------------------------------------------------------------------- |
| `location` | string                                                              |
| `circuits` | `{ label: string; breakerAmps: number; feedsAssetIds: string[] }[]` |

`feedsAssetIds` sind Asset-IDs (als String, kein FK-Constraint — analog zu anderen JSONB-Referenzen im Projekt) der nachgelagerten Assets, die dieser Stromkreis versorgt.

## Netzwerk (`network`-Unterschlüssel, auf jedem Asset-Typ optional verwendbar)

Reine Dokumentation, kein Parser. **Wichtig (ADR-013):** die IP-Adresse selbst ist unkritische technische Dokumentation und darf hier stehen — tatsächliche Zugangsdaten (Passwort, API-Key, Zertifikat) NIEMALS im Klartext, sondern ausschließlich als `secret_reference` (gleiche Konvention wie `Connector.secretReference`, CLAUDE.md: "Keine Credentials im Quellcode").

| Feld                                | Typ                                                               |
| ----------------------------------- | ----------------------------------------------------------------- |
| `network.ipAddress`                 | string                                                            |
| `network.vlan`                      | string oder number                                                |
| `network.accessMethod`              | string (z. B. "VPN", "lokales LAN")                               |
| `network.credentialSecretReference` | string (Verweis auf externen Secret-Store, nie das Secret selbst) |
