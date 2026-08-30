# CEMS Development Rules

- Reihenfolge: Domain-Slice → Migration → Repository → Test → Fixture → Review → nächster Slice. Nicht "100 Dateien generieren, danach testen".
- Keine neuen Domain-Entities erfinden, die nicht in docs/domain-model.md stehen.
- Keine neuen Canonical Metrics ohne Eintrag in docs/canonical-metrics.md.
- Vendor-spezifische Typen/Begriffe (Wendeware-Prefixe wie bat./inv./ch./ctl./mtr./ec./pv./pvp./prc.) bleiben ausschließlich in src/connectors/wendeware. Der Domain Layer kennt sie nicht.
- Vendor-Prefixe/Subindices niemals semantisch interpretieren, wenn das nicht eindeutig in docs/data-requirements.md dokumentiert ist.
- mapping_status hat genau sechs gültige Werte: DISCOVERED, AUTO_MAPPED, MANUAL_MAPPED, VERIFIED, UNMAPPED, REJECTED. Neu entdeckte Vendor-Objekte starten immer als DISCOVERED, nie als MAPPED (siehe docs/decisions/ADR-006-tenant-isolation.md ist NICHT die Quelle dafür – siehe stattdessen den Abschnitt "mapping_status" in docs/domain-model.md und die Mapping-Status-Registry).
- ControlIntent wird als punktuelle Zeitreihe implementiert, wie Measurement (timestamp, kein valid_from/valid_until). Siehe docs/decisions/ADR-007-control-intent-zeitreihe.md.
- Jede Tabelle mit tenant_id (außer den Hypertables measurements/control_intents) erhält eine zusammengesetzte Foreign Key-Beziehung (tenant_id, x_id) → x(tenant_id, id), nicht nur eine einfache FK auf die ID. Siehe docs/decisions/ADR-006-tenant-isolation.md.
- Row-Level-Security-Policies werden erst unmittelbar vor einem echten Kundenpilotbetrieb aktiviert, nicht im ersten Vertical Slice.
- anomalies erhält eine echte nullable FK case_id zu cases (zusätzlich zur losen Kopplung über case_evidence). Siehe docs/decisions/ADR-008-anomaly-case-kopplung.md.
- Der erste Vertical Slice implementiert mehrere Auditor-Regeln (Battery Setpoint Tracking, PV Setpoint vs Actual, Measurement Missing with Heartbeat), nicht nur eine. Siehe docs/decisions/ADR-009-mehrere-auditor-regeln.md und docs/first-vertical-slice.md.
- Forecast wird im ersten Slice nicht gebaut. "Erwartete Werte" werden als Measurement mit quality = CALCULATED behandelt, kein eigenes Forecast-Objekt.
- Keine Credentials im Quellcode – nur secret_reference auf einen externen Secret-Store.
- Jede Migration braucht Tests. Jedes Mapping braucht Fixture-Abdeckung.
- Unbekannte Vendor-Semantik niemals stillschweigend erfinden – unbekannte Objekte/Sensoren bleiben DISCOVERED/UNMAPPED.
- Tenant-Isolation in jeder Query sicherstellen.
- Explizite Domain-Typen bevorzugen, generisches JSON nur dort, wo das Schema es vorsieht (metadata, configuration).
- Kein Frontend, keine HTTP-API-Schicht, kein Auth-System im ersten Vertical Slice (siehe docs/first-vertical-slice.md, Abschnitt "Nicht bauen").
