-- Global, curated registry: no tenant_id (docs/domain-model.md, "MetricDefinition").
CREATE TABLE metric_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (
    category IN (
      'POWER', 'ENERGY', 'BATTERY', 'ELECTRICAL', 'THERMAL',
      'PV_PERFORMANCE', 'ECONOMIC', 'SYSTEM_HEALTH', 'ENVIRONMENT'
    )
  ),
  canonical_unit TEXT NOT NULL,
  value_type TEXT NOT NULL,
  aggregation_method TEXT NOT NULL,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
