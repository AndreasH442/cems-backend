# ADR-006 – Tenant-Isolation: zusammengesetzte FKs jetzt, RLS vor Pilotbetrieb

**Datum:** 30.08.2026

**Entscheidung:** Zusammengesetzte Tenant-FKs `(tenant_id, id) → (tenant_id, id)` werden ab Phase 1 auf allen Kerntabellen außer den Hypertables (measurements, control_intents) eingeführt, weil sie jetzt billig sind und Cross-Tenant-Verknüpfungen strukturell ausschließen – nicht nur per Anwendungscode.

PostgreSQL Row-Level Security wird bewusst NICHT sofort aktiviert, sondern erst unmittelbar vor einem echten Kundenpilotbetrieb, da RLS stark vom noch nicht feststehenden Auth-/Backend-Stack abhängt. Bis dahin bleiben measurements/control_intents (ohne klassische FKs, aus Ingest-Performance-Gründen) ausschließlich durch Application-Layer-Prüfung geschützt – ein bewusst akzeptiertes, temporäres Risiko.

**Kontext:** Ursprünglicher Review-Befund: einfache FKs allein erzwingen Multi-Tenancy nicht strukturell, obwohl das Produkt sie als "harte Sicherheitsgrenze" deklariert.
