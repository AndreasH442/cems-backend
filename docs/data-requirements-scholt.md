# Scholt Energy API – bestätigte Zugriffsmechanik (Stand 02.09.2026)

Geschwister-Dokument zu `docs/data-requirements.md` (Wendeware) und `docs/data-requirements-open-meteo.md` — vendor-neutrale Mechanik hier, kanonisches Mapping im Connector-Code (`src/connectors/scholt/`). Vendor-Name "Scholt" aus der Basis-URL abgeleitet (`scholt.app`) — falls der tatsächliche Firmenname abweicht, ist das eine reine Umbenennung, keine fachliche Änderung.

Die vollständige Doku wurde vom Nutzer bereitgestellt (02.09.2026), nicht selbst exploriert wie bei Wendeware/Open-Meteo — hier trotzdem im gleichen Format festgehalten, damit die Vendor-Mechanik dokumentiert und nicht implizit im Code vergraben ist.

## Auth

HTTP Basic Auth: `Authorization: Basic base64(identifier:secret)`. Kein Token-Endpunkt, kein Ablauf — einfacher als Wendewares OAuth2-Client-Credentials-Flow. Nur über HTTPS (Base64 ist trivial rückwärts lesbar).

## Basis-URL

`https://scholt.app/secapi`

## Berechtigungen

API-Tokens erben Nutzerrechte, mit zwei optionalen, standardmäßig deaktivierten Einschränkungen: `access_usage` (Zugriff auf `usage`-Endpunkte) und `access_invoice` (Zugriff auf `costoverview`-Endpunkte). Nur der Token-Ersteller kann diese vergeben. Antworten von `costoverview`-Endpunkten können zusätzlich Nutzungsinformationen enthalten ("aufgrund der Natur von Rechnungen").

## Endpunkte (bestätigt aus Vendor-Dokumentation)

- `GET /` – Verbindungs-/Auth-Test, 200 OK ohne Body bei Erfolg.
- `GET /token/` – Info über den verwendeten Token (Nutzer, Name, `access_usage`/`access_invoice`, `last_used`).
- `GET /client/` – Liste aller Kunden ("clients"), auf die der Token zugreift. Felder: `reference` (Kunden-Referenz, z. B. `K00000001`), `name`, `account_manager`, Adresse.
- `GET /connection/` – Liste aller Abnahmestellen ("connections"), auf die der Token zugreift. Optionaler Filter `utilitytype=<ele|gas>`. Felder:
  - `reference` – EAN-Nummer der Abnahmestelle (+ evtl. Subcode).
  - `utilitytype` – `ele` (Strom) oder `gas`.
  - `meterreading` – Abrechnungsintervall: `AMR` (automatisch, ~15 Min Strom/stündlich Gas), `MMR` (monatlich), `YMR` (jährlich).
  - `aggregatesummary` – Paare `[unit, direction]`; `unit` z. B. `kWh`/`m3`; `direction` `consumption` (Netzbezug) oder `production` (Einspeisung).
  - `client` – zugehörige Kunden-Referenz.
- `GET /connection/<client>/` – wie oben, gefiltert nach Kunde.
- `GET /connection/<client>/<reference>/` – Detail zu einer Connection (Einzelobjekt statt Liste).
- `GET /connection/<client>/<reference>/usage/` – **[USAGE]** Zeitreihen-Endpunkt. Pflichtparameter `interval=<yearly|monthly|weekly|daily|hourly|quarterly>` (`quarterly` = 15-Minuten-Intervall). Optional `from`/`until` (ISO-Datum, Default: letzte 7 Tage), `include_max=true` (fügt `con_volume_max`/`con_volume_max_dt` hinzu, nur ab `daily`-Auflösung). Antwort: `usage[]` mit `con_volume`, `con_volume_peak`, `con_volume_offpeak`, `datetime`, `unit`.
- `GET /connection/<client>/<connection>/costoverview/` – **[INVOICE]** Kostenaufstellung. Pflichtparameter `year=<year>`, optional `month=<month>`. Nur NL/BE relevant. Antwort: `lines[]`, jede Zeile mit `month`, `article_name`, `article_group`, `taxpercentage`, `slice_from`, `slice_to`, `quantity`, `amount` (ohne MwSt), `taxamount`, `unitprice`, optional `extra` (z. B. `{"utilitytariff": "peak"|"offpeak"}`).
- `GET /client/<client>/costoverview/<utilitytype>/`, `GET /client/<client>/ebbundle/`, `GET /client/<client>/ebbundle/<ebbundle>/costoverview/` – NL-spezifische Bündelungs-Varianten (Energiebelasting-Bundles) — nicht Teil des ersten Connector-Slices.
- `GET /cluster/`, `GET /cluster/<cluster>/usage/`, `GET /cluster/<cluster>/costoverview/` – Kollektive mehrerer Connections, gleiche Antwortform wie die Connection-Varianten — nicht Teil des ersten Connector-Slices.

## `article_group` – bestätigte Werte (Stand Vendor-Doku, **offene Liste**)

```text
Energie
Energiebelasting (Steuern)
Overig (Sonstige)
Netwerkkosten / overheidskosten (Infrastruktur-/staatliche Kosten)
Certificaten (Zertifikate)
```

Vendor-Doku selbst: _"Weitere können später ergänzt werden."_ Deshalb `article_group` in CEMS als `TEXT` ohne CHECK-Constraint (ADR-014) — nicht als geschlossene Registry wie `mapping_status`.

`article_name` ist eine feinere, sich gelegentlich ändernde Untergliederung (Beispiele aus der Doku: "Levering", "Teruglevering", "Heffingskorting", "Onbalans cPPA", "Distributiekosten", "Certificaten") — wird roh übernommen, nicht kategorisiert.

`slice_from`/`slice_to` bilden Staffelgrenzen ab (z. B. Energiebelasting-Steuersätze, die sich nach Verbrauchsmenge staffeln) — eine Artikel-Gruppe kann mehrere Zeilen mit unterschiedlichen Staffeln haben.

Für die Gruppen "Overig", "Netwerkkosten" und "Certificaten" ist laut Vendor-Doku die Einheit von `quantity` oft uneindeutig — dort nur `amount` verlässlich interpretierbar.

`amount` ist immer ohne Mehrwertsteuer; `taxamount` (oder `taxpercentage`) addieren die MwSt.

## Datums-/Zeitformat

ISO 8601: Datum `YYYY-MM-DD`, Datum+Zeit `YYYY-MM-DDTHH:MM:SS+ZZ:ZZ`.

## Debugging

Parameter `format=true` liefert vorformatiertes JSON — nur für Debugging, nicht für reguläre Aufrufe (Bandbreite).

## Fehlerbehandlung

Fehler: JSON `{"error": "<Beschreibung>"}` mit passendem HTTP-Status (403 Auth/Berechtigung, 400 ungültige Eingabe, 500 Serverfehler).

## Datenschutz

Reale Kunden-/Anschluss-Referenzen (EAN, Kunden-Referenz) sind kundenspezifisch und werden NICHT in CEMS-Code/-Doku/-Commits übernommen — nur die vendor-neutrale API-Mechanik oben. Reale Werte nur lokal in nie committeten Temp-Skripten (etabliertes Muster dieser Session).
