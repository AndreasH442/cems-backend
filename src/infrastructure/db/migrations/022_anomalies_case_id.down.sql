ALTER TABLE anomalies DROP CONSTRAINT IF EXISTS anomalies_case_id_fkey;
DROP INDEX IF EXISTS anomalies_case_id_idx;
ALTER TABLE anomalies DROP COLUMN IF EXISTS case_id;
