# CEMS Domain Model (Stand 30.08.2026, nach Review + Entscheidungsprotokoll)

Verbindliche Quelle für Domain-Objekte im ersten Vertical Slice. Nichts hier Aufgeführtes darf ohne Rücksprache erweitert werden. Vollständige SQL-DDL: CEMS_PostgreSQL_TimescaleDB_Schema (Referenzdokument, außerhalb dieses Repos) – dieses Dokument beschreibt die fachliche Sicht.

## Tenancy

- **Tenant** – Mandant. status: ACTIVE/SUSPENDED/ARCHIVED.
- **Organization** – Kunde/Unternehmen unter einem Tenant, optional hierarchisch (parent_organization_id, muss gleicher Tenant sein).
- **Site** – Standort einer Organization. Trägt Geokoordinaten (`latitude`/`longitude`, typisiert) sowie ein generisches `configuration`-Feld für weitere Standort-Stammdaten (ADR-012, digitaler-Zwilling-Fundament).

**Regel (ADR-006):** Jede Tabelle mit `tenant_id` erhält eine zusammengesetzte FK `(tenant_id, x_id) → x(tenant_id, id)`, nicht nur eine einfache FK auf die ID. Ausnahme: die Hypertables `measurements`/`control_intents`.

## Digital Twin

- **Asset** – technisch/wirtschaftlich relevantes Objekt mit eigenem Lebenszyklus (z. B. Batterie, PV-Wechselrichter, Ladesäule, Zähler, EMS). Kann hierarchisch sein (parent_asset_id, gleicher Tenant/Site, keine Zyklen). asset_type-Registry: siehe docs/canonical-metrics.md. Trägt ein generisches `configuration`-Feld für asset-typ-spezifische Stammdaten (z. B. PV: kWp/AC-Leistung/Tilt/Azimuth; ADR-012). Vollständige Stammdaten-Taxonomie je Asset-Typ (Wechselrichter, Speicher, LIS, Unterverteiler, Netzwerk, ...): siehe docs/master-data-schema.md (ADR-013).
- **Component** – Unterobjekt eines Assets (z. B. MPP-Tracker, Ladeconnector, Battery Rack). Unbekannte Wendeware-Unterobjekte werden konservativ als `VENDOR_COMPONENT` geführt.
- **MeasurementPoint** – fachlicher Mess-/Bilanzpunkt (z. B. Netzübergabe, Produktion, Ladepark), unabhängig vom physischen Messgerät. n:m zu Asset über `AssetMeasurementPoint` (zeitlich gültig, relation_type PRIMARY/INPUT/OUTPUT/AUXILIARY/AGGREGATE).
- **MeasurementPointMeter** – zeitlich gültige Zuordnung eines physischen Zähler-Assets zu einem MeasurementPoint. Bewusst getrennt von AssetMeasurementPoint (Entscheidung 30.08.2026), weil hier eine striktere Regel gilt (genau ein Asset vom Typ METER, perspektivisch Exklusivitäts-Constraint).

Wichtig: Asset, Component und MeasurementPoint sind drei unterschiedliche fachliche Konzepte und dürfen nicht vermischt werden.

## Metrics

- **MetricDefinition** – zentrale Canonical Registry (key, category, canonical_unit, value_type, aggregation_method, min/max). Neue Metrics entstehen nie automatisch durch einen Connector, sondern werden bewusst kuratiert (siehe docs/canonical-metrics.md).

## Zeitreihen / operative Daten (fachlich strikt getrennte Datenarten)

- **Measurement** – gemessener/berechneter/geschätzter Wert. Genau ein Subject: Asset XOR Component XOR MeasurementPoint. Quality: MEASURED/CALCULATED/ESTIMATED/SUBSTITUTED/INVALID. `MISSING` wird NICHT als Datensatz persistiert, sondern zur Abfragezeit aus fehlenden Zeilen abgeleitet (kein synthetischer Messwert).
- **ControlIntent** – Sollwert/Limit, eigene fachliche Datenart, keine Measurement-Quality. **Punktuelle Zeitreihe wie Measurement** (Entscheidung 30.08.2026, kein Intervall-Objekt mit valid_from/valid_until). Subject: Asset XOR Component (kein MeasurementPoint, da nicht steuerbar).
- **AssetState** – Zustand (AVAILABILITY/OPERATION/COMMUNICATION/HEALTH), zeitlich gültig (valid_from/valid_until). Subject: Asset XOR Component.
- **Event** – punktuelles/abgegrenztes Ereignis (z. B. DEVICE_FAULT, COMMUNICATION_LOSS, STRATEGY_CHANGED). Event ist NICHT gleich Case.
- **Forecast** – kein eigenes Domain-Objekt (Entscheidung 30.08.2026, bestätigt ADR-012). "Erwartete Werte" werden als Measurement mit quality = CALCULATED behandelt, auch wetterbasiert (ADR-012, Revision der ursprünglichen "nicht wetterbasiert"-Einschränkung).

## Digital Auditor / Operations-Kette

**Anomaly → Case → Recommendation → Action → Verification**

- **Anomaly** – von einer Auditor-Regel erkannte Abweichung. Optionales Subject (höchstens eins; site-weite Anomalien haben keins). confidence 0–1. **case_id** (nullable FK zu Case) – echte strukturelle Kopplung (Entscheidung 30.08.2026), zusätzlich zur losen Kopplung über CaseEvidence.
- **Case** – zentrales Operations-Objekt, site-gebunden. severity und status sind getrennte Konzepte (Severity = Problemrelevanz, Status = Bearbeitungszustand). economic_impact trägt eine quality (CALCULATED/ESTIMATED – wirtschaftliche Werte sind nie MEASURED).
- **CaseSubject** – betroffene/ursächliche Objekte eines Case (Rollen: AFFECTED/ROOT_CAUSE/CONTRIBUTING). Genau ein Subject je Zeile.
- **CaseEvidence** – heterogene Nachweise (ANOMALY/EVENT/STATE/CONTROL_INTENT/FORECAST/MEASUREMENT_WINDOW/DOCUMENT/MANUAL_NOTE). reference_id ist polymorph und nicht klassisch FK-gesichert – ergänzend zur echten `anomalies.case_id`-FK, nicht deren Ersatz.
- **Recommendation** – vorgeschlagene Maßnahme mit erwarteter technischer/wirtschaftlicher Wirkung.
- **Action** – tatsächlich durchgeführte Maßnahme.
- **Verification** – Erfolgsprüfung nach einer Action (SUCCESS/PARTIAL_SUCCESS/NO_EFFECT/NEGATIVE_EFFECT/INCONCLUSIVE).
- **CaseStatusHistory** – jede Statusänderung eines Case wird protokolliert.

## Connector / Mapping

- **Connector** – Instanz eines Datenlieferanten (z. B. WENDEWARE), tenant-, optional site-gebunden. Secrets ausschließlich als secret_reference, nie im Klartext.
- **VendorObjectMapping** – Vendor Object → Asset XOR Component XOR MeasurementPoint (höchstens eins; UNMAPPED/DISCOVERED erlauben kein Ziel).
- **VendorMetricMapping** – Vendor Sensor → Canonical Metric, mit Unit-Konversion (factor/offset) und sign_multiplier. Keine frei ausführbaren Expressions.

### mapping_status – verbindliche Registry (Entscheidung 30.08.2026)

```text
DISCOVERED
AUTO_MAPPED
MANUAL_MAPPED
VERIFIED
UNMAPPED
REJECTED
```

Ein neu entdecktes Vendor-Objekt startet immer als `DISCOVERED`, niemals als `MAPPED` (dieser Wert existiert nicht in der Registry).

Vendor-Prefixe (bat./inv./ch./ctl./mtr./ec./pv./pvp./prc.) werden niemals automatisch semantisch interpretiert – nur wenn eindeutig in docs/data-requirements.md dokumentiert.
