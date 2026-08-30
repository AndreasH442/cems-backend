import type { ControlIntentIngestionService } from "../../application/ingestion/control-intent-ingestion.service.js";
import type { MeasurementIngestionService } from "../../application/ingestion/measurement-ingestion.service.js";
import type { ConnectorId, TenantId } from "../../domain/shared/ids.js";
import type { MappedVendorObjectMapping, VendorObjectMapping } from "../../domain/mapping/vendor-object-mapping.js";
import type { AssetComponentOrMeasurementPointSubject, AssetOrComponentSubject } from "../../domain/shared/subjects.js";
import type { MetricDefinitionRepository } from "../../infrastructure/repositories/metric-definition.repository.js";
import type { VendorMetricMappingRepository } from "../../infrastructure/repositories/vendor-metric-mapping.repository.js";
import type { VendorObjectMappingRepository } from "../../infrastructure/repositories/vendor-object-mapping.repository.js";
import type { WendewareFixture } from "./types.js";

/**
 * Metric keys that are ControlIntents rather than Measurements (ADR-003). This is a routing
 * decision for ingestion, not a schema change — the canonical registry itself is unchanged.
 */
const CONTROL_INTENT_METRIC_KEYS = new Set(["active_power_setpoint"]);

export interface VendorUnitConversion {
  readonly unitFactor: number;
  readonly unitOffset: number;
  readonly signMultiplier: 1 | -1;
}

/** canonical = raw * unitFactor * signMultiplier + unitOffset. Pure — unit-tested directly. */
export function convertVendorValue(rawValue: number, conversion: VendorUnitConversion): number {
  return rawValue * conversion.unitFactor * conversion.signMultiplier + conversion.unitOffset;
}

/** Measurement supports Asset XOR Component XOR MeasurementPoint — every mapped target works. */
function toMeasurementSubject(mapping: MappedVendorObjectMapping): AssetComponentOrMeasurementPointSubject {
  switch (mapping.targetType) {
    case "ASSET":
      return { subjectType: "ASSET", assetId: mapping.targetAssetId, componentId: null, measurementPointId: null };
    case "COMPONENT":
      return {
        subjectType: "COMPONENT",
        assetId: null,
        componentId: mapping.targetComponentId,
        measurementPointId: null,
      };
    case "MEASUREMENT_POINT":
      return {
        subjectType: "MEASUREMENT_POINT",
        assetId: null,
        componentId: null,
        measurementPointId: mapping.targetMeasurementPointId,
      };
  }
}

/** ControlIntent only supports Asset XOR Component (docs/domain-model.md: MeasurementPoint "nicht steuerbar"). */
function toControlIntentSubject(mapping: MappedVendorObjectMapping): AssetOrComponentSubject {
  if (mapping.targetType === "MEASUREMENT_POINT") {
    throw new Error(
      `vendor_object_mapping ${mapping.id} targets a MeasurementPoint, but its metric is a ControlIntent — MeasurementPoint is not steuerbar (docs/domain-model.md)`,
    );
  }
  if (mapping.targetType === "ASSET") {
    return { subjectType: "ASSET", assetId: mapping.targetAssetId, componentId: null };
  }
  return { subjectType: "COMPONENT", assetId: null, componentId: mapping.targetComponentId };
}

export interface WendewareMapperDeps {
  readonly vendorObjectMappings: VendorObjectMappingRepository;
  readonly vendorMetricMappings: VendorMetricMappingRepository;
  readonly metricDefinitions: MetricDefinitionRepository;
  readonly measurementIngestion: MeasurementIngestionService;
  readonly controlIntentIngestion: ControlIntentIngestionService;
}

export interface MapFixtureResult {
  /** Vendor objects seen for the first time — created as DISCOVERED, never as MAPPED (ADR-004). */
  readonly discovered: readonly VendorObjectMapping[];
  readonly measurementsIngested: number;
  readonly controlIntentsIngested: number;
  /** Sensors on an object with no target yet, or with no VendorMetricMapping — silently skipped, not an error. */
  readonly skippedSensors: number;
}

/**
 * Fixture-based only: no live client, no discovery poller (docs/first-vertical-slice.md).
 * Never classifies a vendor object/sensor by prefix — only acts on VendorObjectMapping /
 * VendorMetricMapping rows that already exist (docs/data-requirements.md: prefixes are
 * "NICHT automatisch anzuwenden").
 */
export class WendewareMapper {
  constructor(private readonly deps: WendewareMapperDeps) {}

  async mapAndIngest(
    tenantId: TenantId,
    connectorId: ConnectorId,
    fixture: WendewareFixture,
  ): Promise<MapFixtureResult> {
    const discovered: VendorObjectMapping[] = [];
    let measurementsIngested = 0;
    let controlIntentsIngested = 0;
    let skippedSensors = 0;

    for (const object of fixture.objects) {
      let objectMapping = await this.deps.vendorObjectMappings.findByConnectorAndVendorObjectId(
        tenantId,
        connectorId,
        object.objectId,
      );
      if (!objectMapping) {
        objectMapping = await this.deps.vendorObjectMappings.discover({
          tenantId,
          connectorId,
          vendorObjectId: object.objectId,
        });
        discovered.push(objectMapping);
      }

      if (objectMapping.targetType === null) {
        skippedSensors += object.sensors.length;
        continue;
      }
      const mapping = objectMapping;
      const vendorObjectMappingId = objectMapping.id;

      for (const sensor of object.sensors) {
        const sensorMapping = await this.deps.vendorMetricMappings.findBySensor(
          tenantId,
          vendorObjectMappingId,
          sensor.sensorId,
        );
        if (!sensorMapping) {
          skippedSensors += 1;
          continue;
        }

        const metric = await this.deps.metricDefinitions.findById(sensorMapping.metricDefinitionId);
        if (!metric) {
          throw new Error(`vendor_metric_mapping ${sensorMapping.id} references an unknown metric_definition_id`);
        }

        const value = convertVendorValue(sensor.value, sensorMapping);
        const timestamp = new Date(sensor.timestamp);

        if (CONTROL_INTENT_METRIC_KEYS.has(metric.key)) {
          await this.deps.controlIntentIngestion.ingest({
            ...toControlIntentSubject(mapping),
            tenantId,
            metricKey: metric.key,
            timestamp,
            value,
            connectorId,
            vendorObjectId: object.objectId,
            vendorSensorId: sensor.sensorId,
          });
          controlIntentsIngested += 1;
        } else {
          await this.deps.measurementIngestion.ingest({
            ...toMeasurementSubject(mapping),
            tenantId,
            metricKey: metric.key,
            timestamp,
            value,
            quality: "MEASURED",
            connectorId,
            vendorObjectId: object.objectId,
            vendorSensorId: sensor.sensorId,
          });
          measurementsIngested += 1;
        }
      }
    }

    return { discovered, measurementsIngested, controlIntentsIngested, skippedSensors };
  }
}
