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

export interface WendewareLatestReading {
  readonly sensorId: string;
  readonly value: number;
  /** ISO 8601, as returned by the API. */
  readonly timestamp: string;
}

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
  sensorIds: readonly string[],
  lookbackMinutes: number,
  apiBase = DEFAULT_API_BASE,
  timezone = "Europe/Berlin",
): Promise<WendewareLatestReading[]> {
  if (sensorIds.length === 0) return [];

  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - lookbackMinutes * 60_000);
  const payload = await apiGet(token, apiBase, "/sensors/measurements/seqs/energy_mm_counter_seqs", {
    "filter[sensorIds]": sensorIds.join(","),
    "filter[tFilter][dateFrom]": dateFrom.toISOString(),
    "filter[tFilter][dateTo]": dateTo.toISOString(),
    "filter[resolution]": "1 minute",
    "filter[tz]": timezone,
  });
  return parseLatestValuesResponse(payload, sensorIds);
}
