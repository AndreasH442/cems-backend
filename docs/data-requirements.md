# CEMS Data Requirements – Wendeware/AMPERIX (Stand 01.09.2026)

Reale, an einem Projekt verifizierte Datenverfügbarkeit. Nur das hier Dokumentierte darf als gesicherte Wendeware-Semantik gelten – alles andere ist Annahme und muss vor Nutzung bestätigt werden.

## Real bestätigt verfügbar

**Batterie:** Erzeugung, Verbrauch, Leistungssetzpunkt, min./max. Temperatur, SOH, SOC, DC-Stromstärke, DC-Leistung, DC-Spannung, Blindleistung.

**PV-Wechselrichter:** Erzeugung, Leistungssetzpunkt, Blindleistung; auf tieferen PV-Unterobjekten teilweise zusätzlich DC-Stromstärke/-Leistung/-Spannung.

**Netzanschlusspunkt:** Netz-Strompreis, Netz-Strompreis pro kWh, Netz-Einspeisung, Netz-Bezug. Zusätzlich im Projekt eine EPEX-basierte Preisquelle sichtbar (die wirtschaftliche Wahrheit verwaltet CEMS trotzdem selbst, nicht Wendeware).

**Last-/Messpunkte:** u. a. LP-AC-01…15, LP-DC-01…03, Nutzer-Verbrauch. Diese werden NICHT als physische Geräte modelliert, sondern als MeasurementPoint.

**EMS-Heartbeat (Minutentakt):** lokaler Timestamp, EMS-Status, Temperatur, CPU User/System/Idle, Arbeitsspeicher, Storage, Swap, Inodes, Betriebszeit, Load.

**Ladeinfrastruktur (geprüft, Stand 01.09.2026):** Die einzelnen Ladepunkte sind exakt die oben genannten `LP-AC-*`/`LP-DC-*`-Objekte – der `sensor_type.typeId` heißt vendorseitig `wallbox_meter_demand`, die menschenlesbaren Labels bei diesem Kunden sind aber identisch mit den bereits dokumentierten Last-/Messpunkten. Kein Hinweis auf separate physische Ladesäulen-Objekte jenseits dieser Messpunkte – konsequent als MeasurementPoint modelliert, nicht als eigenes CHARGING_STATION-Asset (ADR-004: Kategorie-Name allein rechtfertigt keine andere Klassifikation, wenn die real vorgefundene Struktur dem widerspricht). Ladeleistung (`power_mm_counter_seqs` → `active_power_consumption`) und -energie (`energy_mm_counter_seqs` → `energy_consumption_total`) sind bestätigt und liefern plausible Werte (Leerlauf 0 kW, aktive Ladepunkte ~10 kW). Connector-Status, Session-Daten, EMS-Limit, Sollwert und Fehlerzustände sind **geprüft und nicht verfügbar** – die vollständige, geschlossene Liste aller 20 real vorhandenen `sensor_type.typeId`-Werte (siehe unten) enthält keine eigene Kategorie dafür. Vehicle-Live-SOC bleibt aus demselben Grund ein bestätigter Gap, kein offener Prüfpunkt mehr.

## Wendeware-Objektstruktur

Präfixe im realen Projekt: `bat.*`, `ch.*`, `ctl.*`, `ec.*`, `inv.*`, `mtr.*`, `prc.*`, `pv.*`, `pvp.*`.

**Wichtige Regel:** Eine Wendeware-Objekt-ID wird NIE automatisch 1:1 zu einem CEMS-Asset. Ein physisches Gerät kann in mehreren logischen Wendeware-Objekten vorkommen. Prefix allein reicht nicht für eine sichere Klassifikation (benötigt: vendor_object_type, vendor_device_family, context, sensor_set – Mapping erfolgt pro konkreter vendor_object_id, nicht per Prefix-Musterkennung).

Vorläufige, NICHT automatisch anzuwendende Rollen-Zuordnung (nur als Hinweis für manuelles Mapping, nicht als Auto-Klassifikationsregel):

| Wendeware Prefix | Vorläufige Rolle  | CEMS Mapping                      |
| ---------------- | ----------------- | --------------------------------- |
| bat.*            | Batterie          | BATTERY_SYSTEM                    |
| inv.*            | Inverter          | PV_INVERTER oder BATTERY_INVERTER |
| ch.*             | Charger           | CHARGING_STATION / Component      |
| ctl.*            | Steuerobjekt      | Vendor Control Object             |
| mtr.*            | Meter             | METER                             |
| ec.*             | Energy Cost       | Economic Data Source              |
| pv.* / pvp.*     | PV-Unterobjekt    | zunächst VENDOR_COMPONENT         |
| prc.*            | Prozess/generisch | zunächst unmapped                 |

## myPowerGrid Customer-API – bestätigte Zugriffsmechanik (Stand 01.09.2026)

Gegen einen echten Kundenzugang verifiziert (OAuth2-Client mit Scope `email`). Die konkrete Client-ID sowie alle Kunden-/Anlagendaten aus diesem Test sind bewusst nicht Teil dieses Dokuments (siehe "Datenschutz" unten) – hier nur die vendor-neutrale API-Mechanik, die für den Connector-Code relevant ist.

**Auth:** OAuth2 Client-Credentials-Flow gegen Keycloak.
`POST https://auth.mypowergrid.de/realms/wendeware/protocol/openid-connect/token` mit `grant_type=client_credentials`, `client_id`, `client_secret`, `scope=email`. Token-Lebensdauer kurz (Größenordnung 300 s) – pro Lauf/Batch neu holen, nicht cachen über Prozessgrenzen hinweg ohne Ablaufprüfung.

**Basis-URL:** `https://www.mypowergrid.de/api/v1/customer` (JSON:API-artiges Antwortformat: `data`/`attributes`/`relationships`/`included`).

**Endpunkte:**

- `GET /energy_management_systems` – listet die EMS-Instanzen, auf die der Client Zugriff hat (`data[].id`, `data[].attributes.name`). Leere Liste bedeutet: authentifiziert, aber keinem EMS zugewiesen (Berechtigungsproblem, keine Datenfrage).
- `GET /sensors?filter[ems_ids]=<emsId>&filter[kind]=16` – Sensor-Inventar für ein EMS. `kind=16` = "reference & virtual sensors" (die menschenlesbare/nutzbare Teilmenge). `included` enthält `sensor_types` (Feld `typeId`) und `devices` (Feld `deviceType`) als Lookup-Tabellen für die Sensor-Relationships. Antwort trägt `meta.hasPermissionRestriction` – `true` bedeutet, die Liste ist durch fehlende Rechte gefiltert, nicht vollständig.
- `GET /sensors/measurements/seqs/<type>` – Zeitreihen-Abruf für mehrere Sensoren gleichzeitig. Parameter: `filter[sensorIds]` (kommasepariert), `filter[tFilter][dateFrom]`/`filter[tFilter][dateTo]` (ISO-Zeitraum), `filter[resolution]` (bestätigt u. a. `"1 minute"`, `"15 minutes"`, `"2 days"`, `"1 month"`), `filter[tz]` (IANA-Zeitzone, z. B. `Europe/Berlin`). Antwortform: `data.attributes.datetimes: string[]` plus je Sensor-ID ein paralleles `data.attributes.<sensorId>: number[]` (Index-Korrespondenz zu `datetimes`, keine Objekt-Liste pro Zeitpunkt).
  - `<type>` ist eine geschlossene Liste, von der API selbst bei ungültigem Wert genannt: `avg_mm_gauge_seqs`, `interpolated_mm_counter_seqs`, `energy_mm_counter_seqs`, `delta_mm_counter_seqs`, `power_mm_counter_seqs`, `delta_per_time_mm_counter_seqs`.
  - Bestätigt funktionsfähig: `energy_mm_counter_seqs` (counter-artige Sensoren) und `avg_mm_gauge_seqs` (gauge-artige Sensoren, z. B. `battery_soc`) – beide gegen echte Sensor-IDs getestet (01.09.2026). Die übrigen vier Typen sind von der API genannt, aber noch nicht gegen echte Daten verifiziert.
  - **Wichtig:** eine Anfrage darf pro Aufruf nur Sensoren EINER Kategorie enthalten (alle counter-artig oder alle gauge-artig) – Mischen wird mit HTTP 400 abgelehnt ("Sensor(s) ... mismatch").

**Bestätigte `sensor_type.typeId`-Werte** (vendor-eigene Kategorisierung, unabhängig von den Präfixen oben – vermutlich eine andere/höhere API-Schicht desselben Produkts, Verhältnis zu den `bat.*`/`inv.*`-Präfixen noch nicht geklärt). Alle am 01.09.2026 real bei einem Kunden vorgefunden:

- counter-artig (funktioniert mit `energy_mm_counter_seqs`): `pv_meter_supply`, `grid_meter_supply`, `grid_meter_demand`, `user_meter_demand`, `wallbox_meter_demand`, `battery_meter_supply`, `battery_meter_demand`
- gauge-artig (alle 11 einzeln gegen `avg_mm_gauge_seqs` mit echten Sensor-IDs getestet, Stand 01.09.2026): `battery_soh`, `battery_soc`, `battery_dc_voltage`, `battery_dc_current`, `battery_dc_power`, `battery_max_temperature`, `battery_min_temperature`, `battery_reactive_power`, `battery_setpoint_power`, `pv_reactive_power`, `pv_setpoint_power`
- vermutlich gauge-artig, ungetestet: `grid_processed_price_eurocent`, `grid_processed_price_unknowncurrency`

**Idempotenz-Empfehlung aus dem Test:** Zeitreihen-Pull mit Sicherheitsfenster (einige Stunden vor dem zuletzt gespeicherten Zeitstempel erneut abfragen, da die API verzögert eintreffende Werte nachliefert) plus `INSERT OR IGNORE`/Upsert auf dem natürlichen Schlüssel – deckt sich mit der bereits dokumentierten Dedup-Strategie für `measurements`/`control_intents` in docs/data-model.md.

**Abgeleitete Leistung aus Zählersensoren:** `power_mm_counter_seqs` und `delta_per_time_mm_counter_seqs` liefern bei echten Sensoren identische Werte (01.09.2026 gegenget). Beide sind eine von der API abgeleitete Momentanleistung (W) aus einem kumulativen Zählersensor; `delta_mm_counter_seqs` liefert stattdessen die Intervallenergie (Wh), `interpolated_mm_counter_seqs` den interpolierten kumulativen Rohzähler (großer Wh-Betrag).

**Vorzeichenkonvention bei Setpoint-Sensoren (abgeleitet, nicht offiziell dokumentiert):** Bei einem echten Kunden (01.09.2026) zeigten `pv_setpoint_power`/`battery_setpoint_power`-Sensoren durchgehend das entgegengesetzte Vorzeichen zur tatsächlichen Ist-Leistung derselben physischen Einheit (z. B. Sollwert ≈ −22 kW bei einer Ist-Erzeugung von ≈ +17…20 kW am selben Wechselrichter). Rein rechnerisch als Vorzeichen-Spiegelung erkennbar, nicht als Dokument von Wendeware bestätigt. Für den Connector bedeutet das: `VendorMetricMapping.sign_multiplier = -1` auf Setpoint-Sensoren, damit Soll- und Istwert im CEMS-Domainmodell dieselbe Polarität tragen (Vorzeichenkorrektur ist genau der vorgesehene Zweck von `sign_multiplier`, siehe ADR-004 – kein Sonderfall-Hack).

**Vorzeichen bei `battery_dc_current`/`battery_dc_power`/`*_reactive_power` (unbestätigt, bewusst unbounded):** Anders als beim Setpoint-Fall gibt es hier keinen zweiten, unabhängigen Messwert zum Gegenprüfen der Polarität (z. B. Lade- vs. Entladerichtung bei DC-Strom/-Leistung). Real beobachtete `pv_reactive_power`-Werte waren bei einem Kunden (01.09.2026) durchgehend leicht negativ (ca. −0.2…−0.3 kVAr) über alle sieben Wechselrichter – plausibel als konsistente vendorseitige Vorzeichenkonvention, aber nicht wie beim Setpoint durch einen Vergleich verifizierbar. Deshalb `sign_multiplier = 1` (unverändert übernommen) und `min_value`/`max_value` bewusst `NULL` für `dc_current`, `dc_power`, `reactive_power` (Migration 035) – anders als bei den bereits verifizierten, eindeutig vorzeichenbehafteten Metriken.

**IEEE754-Rauschen an dokumentierten Grenzwerten:** Kumulative Zählerwerte (z. B. `energy_charge_total`) können durch die vendorseitige Delta-Berechnung Werte knapp außerhalb der dokumentierten Grenze liefern, die eigentlich exakt der Grenze entsprechen sollten (real beobachtet: `-2.2737367544323206e-16` statt `0`). Kein Datenfehler, sondern Fließkomma-Rundungsrauschen. CEMS toleriert das an der Ingestion-Grenze (`clampToMetricBounds`, Toleranz `1e-6`) und rundet auf die dokumentierte Grenze, lehnt aber echte Grenzverletzungen weiterhin ab.

## Aktualisierte Wendeware-Eignung

Sehr gut: Netzbezug/-einspeisung, Verbrauchsmessstellen, PV AC-Leistung, BESS-Leistung, EMS Health, Ladeinfrastruktur-Leistung/-Energie (je Ladepunkt).
Bestätigt, strategisch wertvoll: PV-/BESS-Leistungssetzpunkt, BESS SOC/SOH/Temperatur/DC-Größen.
Bestätigt nicht verfügbar (keine eigene Sensorkategorie): Charger Connector-Status, Session-Daten, Charger Control Intent (Sollwert/Limit), Fehlerzustände.
Gap: Fahrzeug Live-SOC.
Ausdrücklich bei CEMS, nicht bei Wendeware: Business Case, ROI/Economics, Digital Auditor, Cases/Actions, Energy Pool, Grid Forecast/Schedule.

## Datenschutz

Reale Seriennummern und Gerätebezeichnungen aus Projektdaten werden in Dokumentation und Fixtures anonymisiert; nur Hersteller, Gerätetyp und logische Struktur bleiben erhalten.
