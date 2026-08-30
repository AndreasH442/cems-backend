import type { Generated } from "kysely";

export interface TenantsTable {
  id: Generated<string>;
  name: string;
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrganizationsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  parent_organization_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SitesTable {
  id: Generated<string>;
  tenant_id: string;
  organization_id: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AssetsTable {
  id: Generated<string>;
  tenant_id: string;
  site_id: string;
  parent_asset_id: string | null;
  asset_type: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MetricDefinitionsTable {
  id: Generated<string>;
  key: string;
  category: string;
  canonical_unit: string;
  value_type: string;
  aggregation_method: string;
  min_value: number | null;
  max_value: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ConnectorsTable {
  id: Generated<string>;
  tenant_id: string;
  site_id: string | null;
  vendor_type: string;
  name: string;
  secret_reference: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VendorObjectMappingsTable {
  id: Generated<string>;
  tenant_id: string;
  connector_id: string;
  vendor_object_id: string;
  mapping_status: Generated<string>;
  target_type: string | null;
  target_asset_id: string | null;
  target_component_id: string | null;
  target_measurement_point_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VendorMetricMappingsTable {
  id: Generated<string>;
  tenant_id: string;
  vendor_object_mapping_id: string;
  vendor_sensor_id: string;
  metric_definition_id: string;
  unit_factor: Generated<number>;
  unit_offset: Generated<number>;
  sign_multiplier: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MeasurementsTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: Generated<string>;
  asset_id: string | null;
  component_id: string | null;
  measurement_point_id: string | null;
  metric_definition_id: string;
  timestamp: Date;
  value: number;
  quality: string;
  connector_id: string | null;
  vendor_object_id: string | null;
  vendor_sensor_id: string | null;
}

export interface ControlIntentsTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: Generated<string>;
  asset_id: string | null;
  component_id: string | null;
  metric_definition_id: string;
  timestamp: Date;
  value: number;
  connector_id: string | null;
  vendor_object_id: string | null;
  vendor_sensor_id: string | null;
}

export interface AssetStatesTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: Generated<string>;
  asset_id: string | null;
  component_id: string | null;
  category: string;
  state_value: string;
  valid_from: Date;
  valid_until: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EventsTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: string;
  site_id: string | null;
  asset_id: string | null;
  component_id: string | null;
  measurement_point_id: string | null;
  event_type: string;
  occurred_at: Date;
  payload: Generated<unknown>;
  created_at: Generated<Date>;
}

export interface AnomaliesTable {
  id: Generated<string>;
  tenant_id: string;
  site_id: string;
  asset_id: string | null;
  rule_key: string;
  confidence: number;
  detected_at: Date;
  description: string;
  case_id: string | null;
  created_at: Generated<Date>;
}

export interface CasesTable {
  id: Generated<string>;
  tenant_id: string;
  site_id: string;
  severity: string;
  status: Generated<string>;
  title: string;
  description: string;
  economic_impact_value: number | null;
  economic_impact_quality: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CaseSubjectsTable {
  id: Generated<string>;
  tenant_id: string;
  case_id: string;
  asset_id: string;
  role: string;
  created_at: Generated<Date>;
}

export interface CaseEvidenceTable {
  id: Generated<string>;
  tenant_id: string;
  case_id: string;
  evidence_type: string;
  reference_id: string | null;
  metadata: Generated<unknown>;
  created_at: Generated<Date>;
}

export interface RecommendationsTable {
  id: Generated<string>;
  tenant_id: string;
  case_id: string;
  description: string;
  expected_impact: string | null;
  created_at: Generated<Date>;
}

export interface ActionsTable {
  id: Generated<string>;
  tenant_id: string;
  case_id: string;
  recommendation_id: string | null;
  description: string;
  performed_at: Date;
  created_at: Generated<Date>;
}

export interface VerificationsTable {
  id: Generated<string>;
  tenant_id: string;
  case_id: string;
  action_id: string;
  result: string;
  verified_at: Date;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface CaseStatusHistoryTable {
  id: Generated<string>;
  tenant_id: string;
  case_id: string;
  status: string;
  changed_at: Generated<Date>;
  note: string | null;
}

/** Grows one table per domain slice; see docs/data-model.md for the full target set. */
export interface ComponentsTable {
  id: Generated<string>;
  tenant_id: string;
  asset_id: string;
  component_type: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MeasurementPointsTable {
  id: Generated<string>;
  tenant_id: string;
  site_id: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AssetMeasurementPointsTable {
  id: Generated<string>;
  tenant_id: string;
  asset_id: string;
  measurement_point_id: string;
  relation_type: string;
  valid_from: Date;
  valid_until: Date | null;
  created_at: Generated<Date>;
}

export interface MeasurementPointMetersTable {
  id: Generated<string>;
  tenant_id: string;
  measurement_point_id: string;
  meter_asset_id: string;
  valid_from: Date;
  valid_until: Date | null;
  created_at: Generated<Date>;
}

export interface Database {
  tenants: TenantsTable;
  organizations: OrganizationsTable;
  sites: SitesTable;
  assets: AssetsTable;
  components: ComponentsTable;
  measurement_points: MeasurementPointsTable;
  asset_measurement_points: AssetMeasurementPointsTable;
  measurement_point_meters: MeasurementPointMetersTable;
  metric_definitions: MetricDefinitionsTable;
  connectors: ConnectorsTable;
  vendor_object_mappings: VendorObjectMappingsTable;
  vendor_metric_mappings: VendorMetricMappingsTable;
  measurements: MeasurementsTable;
  control_intents: ControlIntentsTable;
  asset_states: AssetStatesTable;
  events: EventsTable;
  anomalies: AnomaliesTable;
  cases: CasesTable;
  case_subjects: CaseSubjectsTable;
  case_evidence: CaseEvidenceTable;
  recommendations: RecommendationsTable;
  actions: ActionsTable;
  verifications: VerificationsTable;
  case_status_history: CaseStatusHistoryTable;
}
