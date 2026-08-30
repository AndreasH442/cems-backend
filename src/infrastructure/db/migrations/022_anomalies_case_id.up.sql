-- ADR-008: echte, nullable FK anomalies -> cases, zusätzlich zur losen Kopplung über case_evidence.
-- Kommt erst hier (nicht in 014_anomalies), weil cases erst in 015 entsteht — siehe Kommentar dort.
ALTER TABLE anomalies ADD COLUMN case_id UUID;
ALTER TABLE anomalies ADD CONSTRAINT anomalies_case_id_fkey FOREIGN KEY (tenant_id, case_id) REFERENCES cases (tenant_id, id);
CREATE INDEX anomalies_case_id_idx ON anomalies (tenant_id, case_id);
