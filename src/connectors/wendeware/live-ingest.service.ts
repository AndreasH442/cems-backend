import { resolveCredentialsFromEnv } from "./credentials.js";
import {
  encodeVendorSensorId,
  fetchAccessToken,
  fetchLatestValues,
  listEnergyManagementSystems,
  listSensors,
  type WendewareSensorMetadata,
} from "./live-client.js";
import type { MapFixtureResult, WendewareMapper } from "./mapper.js";
import type { WendewareFixture, WendewareObjectPayload, WendewareSensorReading } from "./types.js";
import type { ConnectorId, TenantId } from "../../domain/shared/ids.js";
import type { ConnectorRepository } from "../../infrastructure/repositories/connector.repository.js";

export interface WendewareLiveIngestDeps {
  readonly connectors: ConnectorRepository;
  /** Fully composed with its own repositories/ingestion services — reused unchanged. */
  readonly mapper: WendewareMapper;
}

/**
 * The `.../seqs/<type>` endpoints only accept a batch of sensors that all belong to the same
 * broad kind — mixing "counter-like" (cumulative meters) with "gauge-like" (SoC, voltage, power,
 * ...) sensors in one request is rejected with HTTP 400 ("Sensor(s) ... mismatch", confirmed
 * against the real API 01.09.2026). These `sensor_type.typeId` values are the confirmed
 * counter-like categories (docs/data-requirements.md).
 *
 * Each counter sensor is queried through two series types: `energy_mm_counter_seqs` (cumulative
 * total) and `power_mm_counter_seqs` (derived instantaneous power — confirmed to equal
 * `delta_per_time_mm_counter_seqs`, docs/data-requirements.md).
 */
export const CONFIRMED_COUNTER_SENSOR_TYPE_IDS = [
  "pv_meter_supply",
  "grid_meter_supply",
  "grid_meter_demand",
  "user_meter_demand",
  "wallbox_meter_demand",
  "battery_meter_supply",
  "battery_meter_demand",
] as const;

/**
 * All confirmed gauge-like sensor_type categories with a seeded canonical metric
 * (docs/data-requirements.md) — every one of the 11 confirmed real categories except the two
 * still-unconfirmed grid_processed_price_* ones (economic data, out of scope: CEMS manages price
 * truth itself, docs/data-requirements.md "Aktualisierte Wendeware-Eignung").
 */
export const CONFIRMED_GAUGE_SENSOR_TYPE_IDS = [
  "battery_soc",
  "battery_setpoint_power",
  "pv_setpoint_power",
  "battery_soh",
  "battery_dc_voltage",
  "battery_dc_current",
  "battery_dc_power",
  "battery_max_temperature",
  "battery_min_temperature",
  "battery_reactive_power",
  "pv_reactive_power",
] as const;

export interface WendewareLiveIngestResult {
  readonly emsCount: number;
  readonly sensorCount: number;
  readonly readingCount: number;
  readonly mapResult: MapFixtureResult;
  /** Sensor metadata (label/unit) grouped by device id — helps a human decide how to map a discovered device. */
  readonly sensorsByDevice: ReadonlyMap<string, readonly WendewareSensorMetadata[]>;
}

interface DeviceSensor {
  readonly deviceId: string;
  readonly sensor: WendewareSensorMetadata;
}

/**
 * Real HTTP pull, run-once-per-call (no scheduler — docs/first-vertical-slice.md scope stays
 * "kein Discovery-Poller" in the sense of no built-in cron; repeated invocation is the caller's
 * concern). MVP: latest value per sensor within a lookback window, no historical backfill.
 *
 * Builds a WendewareFixture from real API data and hands it to the existing, already-tested
 * WendewareMapper.mapAndIngest — mapping resolution, unit conversion, Measurement/ControlIntent
 * routing and discovery-of-new-objects are reused unchanged, not duplicated.
 */
export class WendewareLiveIngestService {
  constructor(
    private readonly deps: WendewareLiveIngestDeps,
    private readonly lookbackMinutes = 15,
  ) {}

  private async listByCategories(
    token: string,
    emsIds: readonly string[],
    typeIds: readonly string[],
  ): Promise<DeviceSensor[]> {
    const seen = new Set<string>();
    const result: DeviceSensor[] = [];
    for (const emsId of emsIds) {
      for (const typeId of typeIds) {
        const sensors = await listSensors(token, emsId, undefined, typeId);
        for (const sensor of sensors) {
          // No related device in the response -> can't attribute this sensor to a vendor object.
          if (!sensor.deviceId || seen.has(sensor.sensorId)) continue;
          seen.add(sensor.sensorId);
          result.push({ deviceId: sensor.deviceId, sensor });
        }
      }
    }
    return result;
  }

  async pull(tenantId: TenantId, connectorId: ConnectorId): Promise<WendewareLiveIngestResult> {
    const connector = await this.deps.connectors.findById(tenantId, connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    const credentials = resolveCredentialsFromEnv(connector.secretReference);
    const token = await fetchAccessToken(credentials);

    const emsList = await listEnergyManagementSystems(token);
    const emsIds = emsList.map((e) => e.id);

    const counterSensors = await this.listByCategories(token, emsIds, CONFIRMED_COUNTER_SENSOR_TYPE_IDS);
    const gaugeSensors = await this.listByCategories(token, emsIds, CONFIRMED_GAUGE_SENSOR_TYPE_IDS);

    const counterSensorIds = counterSensors.map((s) => s.sensor.sensorId);
    const gaugeSensorIds = gaugeSensors.map((s) => s.sensor.sensorId);

    const [energyReadings, powerReadings, gaugeReadings] = await Promise.all([
      fetchLatestValues(token, "energy_mm_counter_seqs", counterSensorIds, this.lookbackMinutes),
      fetchLatestValues(token, "power_mm_counter_seqs", counterSensorIds, this.lookbackMinutes),
      fetchLatestValues(token, "avg_mm_gauge_seqs", gaugeSensorIds, this.lookbackMinutes),
    ]);
    const energyBySensorId = new Map(energyReadings.map((r) => [r.sensorId, r]));
    const powerBySensorId = new Map(powerReadings.map((r) => [r.sensorId, r]));
    const gaugeBySensorId = new Map(gaugeReadings.map((r) => [r.sensorId, r]));

    const sensorsByDevice = new Map<string, WendewareSensorMetadata[]>();
    const readingsByDevice = new Map<string, WendewareSensorReading[]>();

    function record(deviceId: string, sensor: WendewareSensorMetadata) {
      const forDevice = sensorsByDevice.get(deviceId) ?? [];
      forDevice.push(sensor);
      sensorsByDevice.set(deviceId, forDevice);
    }
    function addReading(
      deviceId: string,
      encodedSensorId: string,
      reading: { value: number; timestamp: string } | undefined,
    ) {
      if (!reading) return;
      const forDevice = readingsByDevice.get(deviceId) ?? [];
      forDevice.push({ sensorId: encodedSensorId, value: reading.value, timestamp: reading.timestamp });
      readingsByDevice.set(deviceId, forDevice);
    }

    for (const { deviceId, sensor } of counterSensors) {
      record(deviceId, sensor);
      addReading(
        deviceId,
        encodeVendorSensorId(sensor.sensorId, "energy_mm_counter_seqs"),
        energyBySensorId.get(sensor.sensorId),
      );
      addReading(
        deviceId,
        encodeVendorSensorId(sensor.sensorId, "power_mm_counter_seqs"),
        powerBySensorId.get(sensor.sensorId),
      );
    }
    for (const { deviceId, sensor } of gaugeSensors) {
      record(deviceId, sensor);
      addReading(
        deviceId,
        encodeVendorSensorId(sensor.sensorId, "avg_mm_gauge_seqs"),
        gaugeBySensorId.get(sensor.sensorId),
      );
    }

    const objects: WendewareObjectPayload[] = [];
    for (const [deviceId, sensorReadings] of readingsByDevice) {
      if (sensorReadings.length > 0) {
        objects.push({ objectId: deviceId, sensors: sensorReadings });
      }
    }

    const fixture: WendewareFixture = { objects };
    const mapResult = await this.deps.mapper.mapAndIngest(tenantId, connectorId, fixture);

    return {
      emsCount: emsList.length,
      sensorCount: counterSensors.length + gaugeSensors.length,
      readingCount: energyReadings.length + powerReadings.length + gaugeReadings.length,
      mapResult,
      sensorsByDevice,
    };
  }
}
