# ADR-011 – TimescaleDB Compression statt Retention auf measurements/control_intents

**Datum:** 01.09.2026

**Entscheidung:** `measurements` und `control_intents` (Hypertables, ADR-002) bekommen TimescaleDB-native Compression aktiviert (`timescaledb.compress`), mit einer automatischen Compression-Policy: Chunks werden 30 Tage nach ihrem Zeitfenster komprimiert (`add_compression_policy(..., INTERVAL '30 days')`). Segmentierung nach `(tenant_id, metric_definition_id)`, Sortierung nach `timestamp DESC` – passend zum bestehenden Abfragemuster (`*_metric_time_idx`-Indizes: ein Tenant, eine Metrik, über einen Zeitraum).

Es wird **bewusst keine Retention-Policy** eingerichtet, die alte Chunks löschen würde.

**Begründung:** Der Digital Auditor soll aus mehreren Jahren Historie lernen können – aktives Löschen alter Messdaten widerspricht diesem Zweck direkt. Compression reduziert den Speicherbedarf für alte, stabile Daten drastisch (TimescaleDB-typisch 90%+), ohne Daten zu verlieren; komprimierte Chunks bleiben normal abfragbar, nur einzelne Zeilen-Updates/-Inserts sind darauf ineffizient.

30 Tage als Schwelle liegt deutlich über dem Lookback-/Upsert-Fenster des Live-Connectors (Minuten bis wenige Stunden, docs/data-requirements.md "Idempotenz-Empfehlung") – neue oder nachträglich korrigierte Werte landen also praktisch nie in einem bereits komprimierten Chunk.

**Konsequenz:** Verifiziert per Up→Down→Up-Roundtrip gegen einen Wegwerf-Container (inkl. eines manuellen Compress/Decompress-Zyklus mit echten Testzeilen, um Datenintegrität nach Kompression zu bestätigen), danach auf die lokale Pilot-DB angewendet. Die Down-Migration dekomprimiert vor dem Deaktivieren, um im Rollback-Fall keine unlesbaren komprimierten Chunks zurückzulassen.
