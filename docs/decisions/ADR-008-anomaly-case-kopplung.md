# ADR-008 – Anomaly-Case-Kopplung

**Datum:** 30.08.2026

**Entscheidung:** `anomalies` erhält eine echte, nullable Fremdschlüsselbeziehung `case_id` zu `cases`, zusätzlich zur bisherigen losen Kopplung über `case_evidence` (Typ ANOMALY). Mehrere Anomalien können denselben `case_id` tragen, wenn der Digitale Auditor sie zu einem Case zusammenführt.

**Begründung:** Die zentrale Prozesskette Anomaly → Case ist das eigentliche Alleinstellungsmerkmal des Produkts und braucht referenzielle Integrität, nicht nur eine polymorphe, nicht FK-gesicherte Evidence-Referenz.
