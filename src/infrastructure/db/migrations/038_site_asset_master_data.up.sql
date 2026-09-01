-- Digital-Zwilling-Stammdaten-Fundament (ADR-012), erster konkreter Bedarf: wetterbasierte
-- PV-Erwartung braucht Standort-Koordinaten + PV-Anlagenparameter. Lat/Lon sind typisierte
-- Spalten, weil universell fuer praktisch jede Standort-Berechnung gebraucht, nicht nur PV.
-- `configuration` ist der bewusst generische Stammdaten-Container fuer alles Asset-/Standort-
-- Typ-Spezifische (heute: PV kWp/AC-Leistung/Tilt/Azimuth; kuenftig z. B. Batterie-Kapazitaet,
-- Netzanschluss-Vertragsleistung) -- matcht die bestehende JSONB-Konvention von
-- events.payload/case_evidence.metadata (gleiche Syntax).
ALTER TABLE sites ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE sites ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE sites ADD COLUMN configuration JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE assets ADD COLUMN configuration JSONB NOT NULL DEFAULT '{}'::jsonb;
