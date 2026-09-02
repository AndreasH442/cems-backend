import { resolveCredentialsFromEnv } from "./credentials.js";
import {
  encodeVendorSensorId,
  fetchAccessToken,
  fetchLatestValues,
  fetchSeriesValues,
  listEnergyManagementSystems,
  listSensors,
  type WendewareReading,
  type WendewareSeriesType,
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
 * All confirmed gauge-like sensor_type categories with a seeded canonical metric and real,
 * non-empty data (docs/data-requirements.md) — 11 device categories plus the one price category
 * that actually returns values for the real pilot EMS. `grid_processed_price_unknowncurrency`
 * exists but returned zero data points over a 48h real window (01.09.2026) — deliberately left
 * out until it's ever observed to carry data; mapping an empty sensor would be guessing.
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
  "grid_processed_price_eurocent",
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

function groupBySensorId(readings: readonly WendewareReading[]): Map<string, WendewareReading[]> {
  const map = new Map<string, WendewareReading[]>();
  for (const reading of readings) {
    const forSensor = map.get(reading.sensorId) ?? [];
    forSensor.push(reading);
    map.set(reading.sensorId, forSensor);
  }
  return map;
}

/**
 * Real HTTP pull against the myPowerGrid Customer API (docs/data-requirements.md). Two modes:
 *
 * - `pull()`: "what's the state right now" — one reading per sensor within a short lookback
 *   window, meant to be called repeatedly (WendewareLiveScheduler, cron, etc.).
 * - `pullRange()`: historical backfill — every reading in an explicit [dateFrom, dateTo] window
 *   (e.g. a whole day), meant to be called once for a given range.
 *
 * Both build a WendewareFixture from real API data and hand it to the existing, already-tested
 * WendewareMapper.mapAndIngest — mapping resolution, unit conversion, Measurement/ControlIntent
 * routing and discovery-of-new-objects are reused unchanged, not duplicated. mapAndIngest already
 * ingests every entry in a sensor's reading array independently (no "one per sensor" assumption),
 * so pullRange needed no mapper changes — only more readings per sensor in the fixture it builds.
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

  private async authenticate(tenantId: TenantId, connectorId: ConnectorId): Promise<string> {
    const connector = await this.deps.connectors.findById(tenantId, connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }
    const credentials = resolveCredentialsFromEnv(connector.secretReference);
    return fetchAccessToken(credentials);
  }

  private async discoverSensors(
    token: string,
    emsIds: readonly string[],
  ): Promise<{ counterSensors: DeviceSensor[]; gaugeSensors: DeviceSensor[] }> {
    const [counterSensors, gaugeSensors] = await Promise.all([
      this.listByCategories(token, emsIds, CONFIRMED_COUNTER_SENSOR_TYPE_IDS),
      this.listByCategories(token, emsIds, CONFIRMED_GAUGE_SENSOR_TYPE_IDS),
    ]);
    return { counterSensors, gaugeSensors };
  }

  /**
   * Builds the objects/sensorsByDevice pair shared by pull() and pullRange() — each sensor's
   * readings (one for pull(), potentially many for pullRange()) are all pushed into its device's
   * sensor list, so mapAndIngest ingests every one of them as its own Measurement.
   */
  private buildFixtureObjects(
    counterSensors: readonly DeviceSensor[],
    gaugeSensors: readonly DeviceSensor[],
    energyBySensorId: ReadonlyMap<string, WendewareReading[]>,
    powerBySensorId: ReadonlyMap<string, WendewareReading[]>,
    gaugeBySensorId: ReadonlyMap<string, WendewareReading[]>,
  ): { objects: WendewareObjectPayload[]; sensorsByDevice: Map<string, WendewareSensorMetadata[]> } {
    const sensorsByDevice = new Map<string, WendewareSensorMetadata[]>();
    const readingsByDevice = new Map<string, WendewareSensorReading[]>();

    function record(deviceId: string, sensor: WendewareSensorMetadata): void {
      const forDevice = sensorsByDevice.get(deviceId) ?? [];
      forDevice.push(sensor);
      sensorsByDevice.set(deviceId, forDevice);
    }
    function addReadings(
      deviceId: string,
      seriesType: WendewareSeriesType,
      rawSensorId: string,
      readings: readonly WendewareReading[] | undefined,
    ): void {
      if (!readings || readings.length === 0) return;
      const forDevice = readingsByDevice.get(deviceId) ?? [];
      const encodedSensorId = encodeVendorSensorId(rawSensorId, seriesType);
      for (const reading of readings) {
        forDevice.push({ sensorId: encodedSensorId, value: reading.value, timestamp: reading.timestamp });
      }
      readingsByDevice.set(deviceId, forDevice);
    }

    for (const { deviceId, sensor } of counterSensors) {
      record(deviceId, sensor);
      addReadings(deviceId, "energy_mm_counter_seqs", sensor.sensorId, energyBySensorId.get(sensor.sensorId));
      addReadings(deviceId, "power_mm_counter_seqs", sensor.sensorId, powerBySensorId.get(sensor.sensorId));
    }
    for (const { deviceId, sensor } of gaugeSensors) {
      record(deviceId, sensor);
      addReadings(deviceId, "avg_mm_gauge_seqs", sensor.sensorId, gaugeBySensorId.get(sensor.sensorId));
    }

    const objects: WendewareObjectPayload[] = [];
    for (const [deviceId, sensorReadings] of readingsByDevice) {
      if (sensorReadings.length > 0) {
        objects.push({ objectId: deviceId, sensors: sensorReadings });
      }
    }
    return { objects, sensorsByDevice };
  }

  async pull(tenantId: TenantId, connectorId: ConnectorId): Promise<WendewareLiveIngestResult> {
    const token = await this.authenticate(tenantId, connectorId);
    const emsList = await listEnergyManagementSystems(token);
    const emsIds = emsList.map((e) => e.id);

    const { counterSensors, gaugeSensors } = await this.discoverSensors(token, emsIds);
    const counterSensorIds = counterSensors.map((s) => s.sensor.sensorId);
    const gaugeSensorIds = gaugeSensors.map((s) => s.sensor.sensorId);

    const [energyReadings, powerReadings, gaugeReadings] = await Promise.all([
      fetchLatestValues(token, "energy_mm_counter_seqs", counterSensorIds, this.lookbackMinutes),
      fetchLatestValues(token, "power_mm_counter_seqs", counterSensorIds, this.lookbackMinutes),
      fetchLatestValues(token, "avg_mm_gauge_seqs", gaugeSensorIds, this.lookbackMinutes),
    ]);

    const { objects, sensorsByDevice } = this.buildFixtureObjects(
      counterSensors,
      gaugeSensors,
      groupBySensorId(energyReadings),
      groupBySensorId(powerReadings),
      groupBySensorId(gaugeReadings),
    );

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

  /**
   * Historical backfill over an explicit range (e.g. a whole day) — every reading becomes its
   * own Measurement, not just the latest per sensor. `resolution` defaults to "15 minutes"
   * (matches the weather-pull default and keeps volumes reasonable); pass "1 minute" for
   * near-native fidelity (docs/data-requirements.md: native sensor resolution is ~58s) on
   * shorter ranges.
   */
  async pullRange(
    tenantId: TenantId,
    connectorId: ConnectorId,
    dateFrom: Date,
    dateTo: Date,
    resolution = "15 minutes",
  ): Promise<WendewareLiveIngestResult> {
    const token = await this.authenticate(tenantId, connectorId);
    const emsList = await listEnergyManagementSystems(token);
    const emsIds = emsList.map((e) => e.id);

    const { counterSensors, gaugeSensors } = await this.discoverSensors(token, emsIds);
    const counterSensorIds = counterSensors.map((s) => s.sensor.sensorId);
    const gaugeSensorIds = gaugeSensors.map((s) => s.sensor.sensorId);

    const [energyReadings, powerReadings, gaugeReadings] = await Promise.all([
      fetchSeriesValues(token, "energy_mm_counter_seqs", counterSensorIds, dateFrom, dateTo, resolution),
      fetchSeriesValues(token, "power_mm_counter_seqs", counterSensorIds, dateFrom, dateTo, resolution),
      fetchSeriesValues(token, "avg_mm_gauge_seqs", gaugeSensorIds, dateFrom, dateTo, resolution),
    ]);

    const { objects, sensorsByDevice } = this.buildFixtureObjects(
      counterSensors,
      gaugeSensors,
      groupBySensorId(energyReadings),
      groupBySensorId(powerReadings),
      groupBySensorId(gaugeReadings),
    );

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
