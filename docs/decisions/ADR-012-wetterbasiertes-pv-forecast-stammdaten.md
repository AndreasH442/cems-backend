# ADR-012 – Wetterbasierte PV-Erwartung erlaubt; Site-/Asset-Stammdaten-Fundament

**Datum:** 01.09.2026

## Entscheidung 1: Forecast darf wetterbasiert sein

`docs/domain-model.md` legte bisher fest: künftiges Forecast sei "strategiebasiert (aus EMS-/Betriebsstrategien abgeleitet), nicht wetterbasiert". Diese Einschränkung wird aufgehoben. CEMS übernimmt die wetterbasierte PV-Erwartungslogik (Open-Meteo + physikalisches PV-Modell), die in einem separaten, bereits funktionierenden Referenzprojekt gegen denselben Piloten validiert wurde.

**Was NICHT revidiert wird:** Es gibt weiterhin kein eigenes Forecast-Domain-Objekt. "Erwartete Werte" bleiben `Measurement` mit `quality = CALCULATED` – exakt das bereits für `expected_active_power` (Migration 006, PV_PERFORMANCE) vorgesehene MVP-Muster. Nur die Quelle der Erwartung ändert sich (jetzt: Wetter statt nichts), nicht die Persistenzform.

**Begründung:** Der SMA-Wechselrichter-eigene Ertragswert ist statisch/annualisiert, kein echtes Forecasting (bereits in `docs/data-requirements.md` dokumentiert). Ein wetterbasiertes Modell ist methodisch überlegen und wurde extern bereits validiert – Neubau wäre Doppelarbeit.

## Entscheidung 2: Site-/Asset-Stammdaten als generelles Fundament

Für die PV-Erwartung werden pro Standort Geokoordinaten und pro PV-Anlage physikalische Parameter (kWp, AC-Leistung, Tilt, Azimuth) benötigt. Statt eng auf diesen einen Anwendungsfall zugeschnittener Felder wird das Schema bewusst als generelles Stammdaten-Fundament für den künftigen digitalen Zwilling angelegt:

- `sites.latitude`/`sites.longitude`: typisierte Spalten – universell für praktisch jede Standort-Berechnung gebraucht, nicht nur PV.
- `sites.configuration` / `assets.configuration` (beide `JSONB NOT NULL DEFAULT '{}'::jsonb`): generischer Stammdaten-Container für alles Asset-/Standort-Typ-Spezifische (heute: PV-Parameter; künftig z. B. Batterie-Chemie/-Kapazität, Netzanschluss-Vertragsleistung). Matcht die bestehende Konvention "explizite Domain-Typen bevorzugen, generisches JSON nur dort, wo das Schema es vorsieht" (CLAUDE.md) – gleiche Syntax wie die bereits existierenden `events.payload`/`case_evidence.metadata`.

**Begründung:** Der Nutzer will einen digitalen Zwilling mit vollständiger, pflegbarer Stammdatenverwaltung je Standort – kein Feld, das nur für Wetter gilt. Ein generischer JSONB-Container vermeidet Schema-Explosion (nicht für jeden künftigen Asset-Typ-Parameter eine neue Migration), während die wirklich universellen Felder (Geokoordinaten) trotzdem typisiert bleiben.

**Konsequenz:** Kein Pflege-UI/API in diesem Repo (kein Frontend/HTTP-Layer, `docs/first-vertical-slice.md`) – nur das Datenfundament plus Repository-Methoden (`updateLocation`, `updateConfiguration`), das eine spätere Verwaltungsoberfläche direkt nutzen kann. Einpflegen erfolgt vorerst über Onboarding-Skripte, wie beim Wendeware-Connector.
