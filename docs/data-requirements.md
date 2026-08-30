# CEMS Data Requirements – Wendeware/AMPERIX (Stand 30.08.2026)

Reale, an einem Projekt verifizierte Datenverfügbarkeit. Nur das hier Dokumentierte darf als gesicherte Wendeware-Semantik gelten – alles andere ist Annahme und muss vor Nutzung bestätigt werden.

## Real bestätigt verfügbar

**Batterie:** Erzeugung, Verbrauch, Leistungssetzpunkt, min./max. Temperatur, SOH, SOC, DC-Stromstärke, DC-Leistung, DC-Spannung, Blindleistung.

**PV-Wechselrichter:** Erzeugung, Leistungssetzpunkt, Blindleistung; auf tieferen PV-Unterobjekten teilweise zusätzlich DC-Stromstärke/-Leistung/-Spannung.

**Netzanschlusspunkt:** Netz-Strompreis, Netz-Strompreis pro kWh, Netz-Einspeisung, Netz-Bezug. Zusätzlich im Projekt eine EPEX-basierte Preisquelle sichtbar (die wirtschaftliche Wahrheit verwaltet CEMS trotzdem selbst, nicht Wendeware).

**Last-/Messpunkte:** u. a. LP-AC-01…15, LP-DC-01…03, Nutzer-Verbrauch. Diese werden NICHT als physische Geräte modelliert, sondern als MeasurementPoint.

**EMS-Heartbeat (Minutentakt):** lokaler Timestamp, EMS-Status, Temperatur, CPU User/System/Idle, Arbeitsspeicher, Storage, Swap, Inodes, Betriebszeit, Load.

**Ladeinfrastruktur:** Geräte-Inventar bestätigt; Ladeleistung/-energie, Connector-Status, Session-Daten, EMS-Limit, Sollwert, Fehlerzustände noch zu prüfen. Vehicle-Live-SOC bleibt ein Gap.

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

## Aktualisierte Wendeware-Eignung

Sehr gut: Netzbezug/-einspeisung, Verbrauchsmessstellen, PV AC-Leistung, BESS-Leistung, EMS Health.
Bestätigt, strategisch wertvoll: PV-/BESS-Leistungssetzpunkt, BESS SOC/SOH/Temperatur/DC-Größen.
Noch zu prüfen: Charger-Messwerte, Charger Control Intent.
Gap: Fahrzeug Live-SOC.
Ausdrücklich bei CEMS, nicht bei Wendeware: Business Case, ROI/Economics, Digital Auditor, Cases/Actions, Energy Pool, Grid Forecast/Schedule.

## Datenschutz

Reale Seriennummern und Gerätebezeichnungen aus Projektdaten werden in Dokumentation und Fixtures anonymisiert; nur Hersteller, Gerätetyp und logische Struktur bleiben erhalten.
