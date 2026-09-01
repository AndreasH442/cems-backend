/**
 * Real HTTP client for the Open-Meteo Forecast API (docs/data-requirements-open-meteo.md).
 * Pure network + parsing, no DB access — orchestration lives in ingest.service.ts. No auth: the
 * free tier needs no API key.
 */

const DEFAULT_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const TIMEZONE = "Europe/Berlin";
const VARIABLES = ["global_tilted_irradiance", "temperature_2m", "wind_speed_10m", "cloud_cover"] as const;

export interface WeatherSlot {
  /** Absolute UTC instant of this 15-minute slot. */
  readonly timestamp: Date;
  readonly gtiWm2: number;
  readonly tAirC: number;
  readonly windMs: number;
  readonly cloudPct: number;
}

export interface FetchForecastInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly tiltDegrees: number;
  readonly azimuthDegrees: number;
  /** Days in the past to include (0-92, Open-Meteo range). */
  readonly pastDays: number;
  /** Days in the future to include (0-16, Open-Meteo range). */
  readonly forecastDays: number;
}

/** Shared shape of both the `minutely_15` (forecast) and `hourly` (archive) response blocks. */
interface WeatherBlock {
  readonly time?: readonly string[];
  readonly global_tilted_irradiance?: readonly (number | null)[];
  readonly temperature_2m?: readonly (number | null)[];
  readonly wind_speed_10m?: readonly (number | null)[];
  readonly cloud_cover?: readonly (number | null)[];
}

interface ForecastResponse {
  readonly utc_offset_seconds?: number;
  readonly minutely_15?: WeatherBlock;
}

export interface FetchArchiveInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly tiltDegrees: number;
  readonly azimuthDegrees: number;
  /** ISO date, e.g. "2026-08-01". */
  readonly startDate: string;
  /** ISO date, e.g. "2026-08-31". */
  readonly endDate: string;
}

interface ArchiveResponse {
  readonly utc_offset_seconds?: number;
  readonly hourly?: WeatherBlock;
}

export async function fetchForecast(input: FetchForecastInput, apiBase = DEFAULT_FORECAST_URL): Promise<WeatherSlot[]> {
  const url = new URL(apiBase);
  url.searchParams.set("latitude", String(input.latitude));
  url.searchParams.set("longitude", String(input.longitude));
  url.searchParams.set("tilt", String(input.tiltDegrees));
  url.searchParams.set("azimuth", String(input.azimuthDegrees));
  url.searchParams.set("minutely_15", VARIABLES.join(","));
  url.searchParams.set("past_days", String(input.pastDays));
  url.searchParams.set("forecast_days", String(input.forecastDays));
  url.searchParams.set("timezone", TIMEZONE);

  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Open-Meteo forecast request failed: HTTP ${resp.status} — ${body.slice(0, 1000)}`);
  }
  const payload = (await resp.json()) as ForecastResponse;
  return parseSlots(payload.minutely_15 ?? {}, payload.utc_offset_seconds ?? 0);
}

/**
 * ERA5 reanalysis, hourly resolution, 2-5 day lag (docs/data-requirements-open-meteo.md) — used
 * for retrospective PV-expectation/curtailment analysis rather than live/near-term comparisons.
 */
export async function fetchArchive(input: FetchArchiveInput, apiBase = DEFAULT_ARCHIVE_URL): Promise<WeatherSlot[]> {
  const url = new URL(apiBase);
  url.searchParams.set("latitude", String(input.latitude));
  url.searchParams.set("longitude", String(input.longitude));
  url.searchParams.set("tilt", String(input.tiltDegrees));
  url.searchParams.set("azimuth", String(input.azimuthDegrees));
  url.searchParams.set("hourly", VARIABLES.join(","));
  url.searchParams.set("start_date", input.startDate);
  url.searchParams.set("end_date", input.endDate);
  url.searchParams.set("timezone", TIMEZONE);

  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Open-Meteo archive request failed: HTTP ${resp.status} — ${body.slice(0, 1000)}`);
  }
  const payload = (await resp.json()) as ArchiveResponse;
  return parseSlots(payload.hourly ?? {}, payload.utc_offset_seconds ?? 0);
}

/**
 * Open-Meteo returns naive local-time strings (e.g. "2026-09-01T00:00", no offset) plus a
 * separate utc_offset_seconds — converts each to an absolute UTC instant explicitly, independent
 * of the server process's own timezone.
 */
function parseSlots(block: WeatherBlock, utcOffsetSeconds: number): WeatherSlot[] {
  const times = block.time ?? [];
  const gti = block.global_tilted_irradiance ?? [];
  const tAir = block.temperature_2m ?? [];
  const wind = block.wind_speed_10m ?? [];
  const cloud = block.cloud_cover ?? [];

  return times.map((raw, i) => ({
    timestamp: parseLocalIsoToUtc(raw, utcOffsetSeconds),
    gtiWm2: safeNumber(gti[i]),
    tAirC: safeNumber(tAir[i]),
    windMs: safeNumber(wind[i]),
    cloudPct: safeNumber(cloud[i]),
  }));
}

function parseLocalIsoToUtc(localIso: string, utcOffsetSeconds: number): Date {
  const year = Number(localIso.slice(0, 4));
  const month = Number(localIso.slice(5, 7));
  const day = Number(localIso.slice(8, 10));
  const hour = Number(localIso.slice(11, 13));
  const minute = Number(localIso.slice(14, 16));
  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) {
    throw new Error(`Unparseable Open-Meteo timestamp: "${localIso}"`);
  }
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - utcOffsetSeconds * 1000);
}

function safeNumber(value: number | null | undefined): number {
  return typeof value === "number" ? value : 0;
}
