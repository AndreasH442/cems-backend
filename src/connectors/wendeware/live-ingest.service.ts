import { resolveCredentialsFromEnv } from "./credentials.js";
import {
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

export interface WendewareLiveIngestResult {
  readonly emsCount: number;
  readonly sensorCount: number;
  readonly readingCount: number;
  readonly mapResult: MapFixtureResult;
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

  async pull(tenantId: TenantId, connectorId: ConnectorId): Promise<WendewareLiveIngestResult> {
    const connector = await this.deps.connectors.findById(tenantId, connectorId);
    if (!connector) {
      throw new Error(`Connector ${connectorId} not found`);
    }

    const credentials = resolveCredentialsFromEnv(connector.secretReference);
    const token = await fetchAccessToken(credentials);

    const emsList = await listEnergyManagementSystems(token);

    const sensorsByDevice = new Map<string, WendewareSensorMetadata[]>();
    let sensorCount = 0;
    for (const ems of emsList) {
      const sensors = await listSensors(token, ems.id);
      for (const sensor of sensors) {
        // No related device in the response -> can't attribute this sensor to a vendor object.
        if (!sensor.deviceId) continue;
        const forDevice = sensorsByDevice.get(sensor.deviceId) ?? [];
        forDevice.push(sensor);
        sensorsByDevice.set(sensor.deviceId, forDevice);
        sensorCount += 1;
      }
    }

    const allSensorIds = [...sensorsByDevice.values()].flat().map((s) => s.sensorId);
    const readings = await fetchLatestValues(token, allSensorIds, this.lookbackMinutes);
    const readingBySensorId = new Map(readings.map((r) => [r.sensorId, r]));

    const objects: WendewareObjectPayload[] = [];
    for (const [deviceId, sensors] of sensorsByDevice) {
      const sensorReadings: WendewareSensorReading[] = [];
      for (const sensor of sensors) {
        const reading = readingBySensorId.get(sensor.sensorId);
        if (reading) {
          sensorReadings.push({ sensorId: sensor.sensorId, value: reading.value, timestamp: reading.timestamp });
        }
      }
      if (sensorReadings.length > 0) {
        objects.push({ objectId: deviceId, sensors: sensorReadings });
      }
    }

    const fixture: WendewareFixture = { objects };
    const mapResult = await this.deps.mapper.mapAndIngest(tenantId, connectorId, fixture);

    return { emsCount: emsList.length, sensorCount, readingCount: readings.length, mapResult };
  }
}
