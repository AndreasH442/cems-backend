# ADR-007 – ControlIntent als punktuelle Zeitreihe

**Datum:** 30.08.2026

**Entscheidung:** ControlIntent wird technisch wie Measurement als punktuell erfasste Hypertable-Zeitreihe implementiert (`timestamp`, kein `valid_from`/`valid_until`), nicht als Intervall-/State-Objekt.

**Begründung:** Die reale Wendeware-Ingestion liefert Sollwerte (z. B. Leistungssetzpunkt) im selben periodischen Poll-Rhythmus wie Messwerte. Eine Intervall-Modellierung hätte bei jedem Poll eine zustandsbehaftete Entscheidung verlangt (bestehende Zeile schließen oder neue öffnen?) – das ist für das MVP unnötige Ingest-Komplexität. Der "aktuell gültige Sollwert" wird stattdessen zur Abfragezeit aus dem jeweils letzten Datenpunkt vor einem Zeitpunkt ermittelt.
