# ADR-009 – Mehrere Auditor-Regeln im ersten Vertical Slice

**Datum:** 30.08.2026

**Entscheidung:** Der erste Vertical Slice implementiert bewusst alle drei bereits skizzierten Regeln statt nur einer:

1. BATTERY_SETPOINT_TRACKING_V1
2. PV_SETPOINT_VS_ACTUAL_V1
3. MEASUREMENT_MISSING_WITH_HEARTBEAT_V1 (benötigt zusätzlich Event-Ingest für EMS-Heartbeats)

**Begründung:** Macht den Slice umfangreicher, aber realistischer und deckt gleichzeitig events sowie das Zusammenspiel mehrerer Anomalien pro Case ab.
