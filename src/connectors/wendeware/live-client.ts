import type { WendewareCredentials } from "./credentials.js";

/**
 * Real HTTP client for the myPowerGrid Customer API (docs/data-requirements.md, "myPowerGrid
 * Customer-API – bestätigte Zugriffsmechanik"). Pure network + parsing, no DB access — the
 * orchestration into our own domain lives in live-ingest.service.ts.
 */

const DEFAULT_TOKEN_URL = "https://auth.mypowergrid.de/realms/wendeware/protocol/openid-connect/token";
const DEFAULT_API_BASE = "https://www.mypowergrid.de/api/v1/customer";

interface JsonApiResource {
  readonly id: string;
  readonly type?: string;
  readonly attributes?: Record<string, unknown>;
  readonly relationships?: Record<string, { data?: { id: string; type?: string } | null }>;
}

interface JsonApiCollection {
  readonly data?: readonly JsonApiResource[];
  readonly included?: readonly JsonApiResource[];
}

export async function fetchAccessToken(creds: WendewareCredentials, tokenUrl = DEFAULT_TOKEN_URL): Promise<string> {
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: "email",
    }),
  });
  if (!resp.ok) {
    throw new Error(`Wendeware token request failed: HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("Wendeware token response had no access_token");
  }
  return body.access_token;
}

async function apiGet(
  token: string,
  apiBase: string,
  path: string,
  params?: Record<string, string>,
): Promise<JsonApiCollection> {
  const url = new URL(apiBase.replace(/\/$/, "") + path);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json" },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Wendeware API request to ${path} failed: HTTP ${resp.status} — ${body.slice(0, 1000)}`);
  }
  return (await resp.json()) as JsonApiCollection;
}

export interface WendewareEnergyManagementSystem {
  readonly id: string;
  readonly name: string;
}

export async function listEnergyManagementSystems(
  token: string,
  apiBase = DEFAULT_API_BASE,
): Promise<WendewareEnergyManagementSystem[]> {
  const payload = await apiGet(token, apiBase, "/energy_management_systems");
  return (payload.data ?? []).map((item) => ({
    id: item.id,
    name: (item.attributes?.["name"] as string | undefined) ?? "",
  }));
}

export interface WendewareSensorMetadata {
  readonly sensorId: string;
  /** Null when the sensor has no related device in the response's `included` set. */
  readonly deviceId: string | null;
  readonly label: string;
  readonly unit: string;
}

export async function listSensors(
  token: string,
  emsId: string,
  apiBase = DEFAULT_API_BASE,
  /** Optional `sensor_type.typeId` filter — see CONFIRMED_COUNTER_SENSOR_TYPE_IDS in live-ingest.service.ts. */
  sensorTypeId?: string,
): Promise<WendewareSensorMetadata[]> {
  const payload = await apiGet(token, apiBase, "/sensors", {
    "filter[ems_ids]": emsId,
    "filter[kind]": "16",
    ...(sensorTypeId ? { "filter[sensor_type][type_id]": sensorTypeId } : {}),
  });
  return (payload.data ?? []).map((item) => ({
    sensorId: item.id,
    deviceId: item.relationships?.["device"]?.data?.id ?? null,
    label: (item.attributes?.["label"] as string | undefined) ?? "",
    unit: (item.attributes?.["unit"] as string | undefined) ?? "",
  }));
}

/**
 * The full, closed set of `.../seqs/<type>` values — confirmed by requesting an invalid one and
 * reading the API's own error message (01.09.2026), see docs/data-requirements.md. Only the
 * counter/gauge/power ones are actually used by live-ingest.service.ts; the rest are documented
 * but unused (interpolated_mm_counter_seqs, delta_mm_counter_seqs).
 */
export const WENDEWARE_SERIES_TYPES = [
  "avg_mm_gauge_seqs",
  "interpolated_mm_counter_seqs",
  "energy_mm_counter_seqs",
  "delta_mm_counter_seqs",
  "power_mm_counter_seqs",
  "delta_per_time_mm_counter_seqs",
] as const;
export type WendewareSeriesType = (typeof WENDEWARE_SERIES_TYPES)[number];

const VENDOR_SENSOR_ID_SEPARATOR = "#";

/**
 * The same raw sensor id yields independent value streams depending on which series type it's
 * queried with (e.g. a counter sensor's cumulative total vs. its derived instantaneous power) —
 * from CEMS's point of view these are logically distinct "vendor sensors" that happen to share a
 * wire-level id. Encoding both into the opaque vendor_sensor_id string keeps that distinction
 * without a schema change — still never interpreted outside src/connectors/wendeware (ADR-004).
 */
export function encodeVendorSensorId(sensorId: string, seriesType: WendewareSeriesType): string {
  return `${sensorId}${VENDOR_SENSOR_ID_SEPARATOR}${seriesType}`;
}

export interface WendewareLatestReading {
  readonly sensorId: string;
  readonly value: number;
  /** ISO 8601, as returned by the API. */
  readonly timestamp: string;
}

/** Same shape as WendewareLatestReading — a neutral alias for series/backfill call sites, where "latest" would be misleading (every point in a range, not just the last one). */
export type WendewareReading = WendewareLatestReading;

/** Pure — the response has one `datetimes[]` array plus one parallel `<sensorId>[]` array per sensor. */
export function parseLatestValuesResponse(payload: unknown, sensorIds: readonly string[]): WendewareLatestReading[] {
  const attrs = (payload as { data?: { attributes?: Record<string, unknown> } } | undefined)?.data?.attributes ?? {};
  const datetimes = (attrs["datetimes"] as (string | undefined)[] | undefined) ?? [];

  const readings: WendewareLatestReading[] = [];
  for (const sensorId of sensorIds) {
    const values = (attrs[sensorId] as (number | null | undefined)[] | undefined) ?? [];
    for (let i = values.length - 1; i >= 0; i--) {
      const value = values[i];
      const timestamp = datetimes[i];
      if (value !== null && value !== undefined && timestamp) {
        readings.push({ sensorId, value, timestamp });
        break;
      }
    }
  }
  return readings;
}

export async function fetchLatestValues(
  token: string,
  seriesType: WendewareSeriesType,
  sensorIds: readonly string[],
  lookbackMinutes: number,
  apiBase = DEFAULT_API_BASE,
  timezone = "Europe/Berlin",
): Promise<WendewareLatestReading[]> {
  if (sensorIds.length === 0) return [];

  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - lookbackMinutes * 60_000);
  const payload = await apiGet(token, apiBase, `/sensors/measurements/seqs/${seriesType}`, {
    "filter[sensorIds]": sensorIds.join(","),
    "filter[tFilter][dateFrom]": dateFrom.toISOString(),
    "filter[tFilter][dateTo]": dateTo.toISOString(),
    "filter[resolution]": "1 minute",
    "filter[tz]": timezone,
  });
  return parseLatestValuesResponse(payload, sensorIds);
}

/**
 * Pure — every non-null (sensorId, value, timestamp) point in the response, not just the latest
 * per sensor. Used for backfill (fetchSeriesValues below), where every point in the range is
 * meant to become its own Measurement — unlike parseLatestValuesResponse, which is deliberately
 * lossy (used for "what's the state right now" pulls, not history).
 */
export function parseSeriesResponse(payload: unknown, sensorIds: readonly string[]): WendewareReading[] {
  const attrs = (payload as { data?: { attributes?: Record<string, unknown> } } | undefined)?.data?.attributes ?? {};
  const datetimes = (attrs["datetimes"] as (string | undefined)[] | undefined) ?? [];

  const readings: WendewareReading[] = [];
  for (const sensorId of sensorIds) {
    const values = (attrs[sensorId] as (number | null | undefined)[] | undefined) ?? [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const timestamp = datetimes[i];
      if (value !== null && value !== undefined && timestamp) {
        readings.push({ sensorId, value, timestamp });
      }
    }
  }
  return readings;
}

/**
 * Full time series over an explicit [dateFrom, dateTo] range, at the given resolution — for
 * historical backfill (a whole day, etc.), not "current state" pulls. Confirmed resolutions
 * (docs/data-requirements.md): "1 minute", "15 minutes", "2 days", "1 month".
 */
export async function fetchSeriesValues(
  token: string,
  seriesType: WendewareSeriesType,
  sensorIds: readonly string[],
  dateFrom: Date,
  dateTo: Date,
  resolution: string,
  apiBase = DEFAULT_API_BASE,
  timezone = "Europe/Berlin",
): Promise<WendewareReading[]> {
  if (sensorIds.length === 0) return [];

  const payload = await apiGet(token, apiBase, `/sensors/measurements/seqs/${seriesType}`, {
    "filter[sensorIds]": sensorIds.join(","),
    "filter[tFilter][dateFrom]": dateFrom.toISOString(),
    "filter[tFilter][dateTo]": dateTo.toISOString(),
    "filter[resolution]": resolution,
    "filter[tz]": timezone,
  });
  return parseSeriesResponse(payload, sensorIds);
}
