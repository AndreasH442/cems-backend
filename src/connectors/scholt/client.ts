import { toBasicAuthHeader, type ScholtCredentials } from "./credentials.js";

/**
 * Real HTTP client for the Scholt Energy API (docs/data-requirements-scholt.md). Pure network +
 * parsing, no DB access — orchestration lives in ingest.service.ts. Basic Auth, no token
 * endpoint (simpler than Wendeware's OAuth2 client-credentials flow).
 */

const DEFAULT_API_BASE = "https://scholt.app/secapi";

async function apiGet(
  creds: ScholtCredentials,
  apiBase: string,
  path: string,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(apiBase.replace(/\/$/, "") + path);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  const resp = await fetch(url, { headers: { Authorization: toBasicAuthHeader(creds), Accept: "application/json" } });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Scholt API request to ${path} failed: HTTP ${resp.status} — ${body.slice(0, 1000)}`);
  }
  return resp.json();
}

export interface ScholtClient {
  readonly reference: string;
  readonly name: string;
}

export async function fetchClients(creds: ScholtCredentials, apiBase = DEFAULT_API_BASE): Promise<ScholtClient[]> {
  const payload = (await apiGet(creds, apiBase, "/client/")) as { clients?: { reference: string; name: string }[] };
  return (payload.clients ?? []).map((c) => ({ reference: c.reference, name: c.name }));
}

export const UTILITY_TYPES = ["ele", "gas"] as const;
export type ScholtUtilityType = (typeof UTILITY_TYPES)[number];

export interface ScholtConnection {
  readonly reference: string;
  readonly utilitytype: ScholtUtilityType;
  readonly meterreading: "AMR" | "MMR" | "YMR";
  readonly client: string;
}

export async function fetchConnections(
  creds: ScholtCredentials,
  client?: string,
  utilitytype?: ScholtUtilityType,
  apiBase = DEFAULT_API_BASE,
): Promise<ScholtConnection[]> {
  const path = client ? `/connection/${encodeURIComponent(client)}/` : "/connection/";
  const payload = (await apiGet(creds, apiBase, path, utilitytype ? { utilitytype } : undefined)) as {
    connections?: ScholtConnection[];
  };
  return payload.connections ?? [];
}

export type ScholtUsageInterval = "yearly" | "monthly" | "weekly" | "daily" | "hourly" | "quarterly";

export interface ScholtUsageReading {
  readonly datetime: string;
  readonly unit: string;
  readonly conVolume: number;
  readonly conVolumePeak: number | null;
  readonly conVolumeOffpeak: number | null;
}

interface RawUsageReading {
  readonly datetime: string;
  readonly unit: string;
  readonly con_volume: number;
  readonly con_volume_peak?: number;
  readonly con_volume_offpeak?: number;
}

/** [USAGE]-scoped time series endpoint (docs/data-requirements-scholt.md). */
export async function fetchUsage(
  creds: ScholtCredentials,
  client: string,
  connectionReference: string,
  interval: ScholtUsageInterval,
  from?: string,
  until?: string,
  apiBase = DEFAULT_API_BASE,
): Promise<ScholtUsageReading[]> {
  const params: Record<string, string> = { interval };
  if (from) params["from"] = from;
  if (until) params["until"] = until;
  const payload = (await apiGet(
    creds,
    apiBase,
    `/connection/${encodeURIComponent(client)}/${encodeURIComponent(connectionReference)}/usage/`,
    params,
  )) as { usage?: RawUsageReading[] };
  return (payload.usage ?? []).map((u) => ({
    datetime: u.datetime,
    unit: u.unit,
    conVolume: u.con_volume,
    conVolumePeak: u.con_volume_peak ?? null,
    conVolumeOffpeak: u.con_volume_offpeak ?? null,
  }));
}

export interface ScholtCostOverviewLine {
  readonly month: number;
  readonly articleName: string;
  readonly articleGroup: string;
  readonly taxPercentage: number | null;
  readonly sliceFrom: number | null;
  readonly sliceTo: number | null;
  readonly quantity: number | null;
  readonly amount: number;
  readonly taxAmount: number | null;
  readonly unitPrice: number | null;
  readonly extra: Record<string, unknown> | null;
}

interface RawCostOverviewLine {
  readonly month: number;
  readonly article_name: string;
  readonly article_group: string;
  readonly taxpercentage?: number | null;
  readonly slice_from?: number | null;
  readonly slice_to?: number | null;
  readonly quantity?: number | null;
  readonly amount: number;
  readonly taxamount?: number | null;
  readonly unitprice?: number | null;
  readonly extra?: Record<string, unknown> | null;
}

/** [INVOICE]-scoped cost-breakdown endpoint (docs/data-requirements-scholt.md) — NL/BE only. */
export async function fetchCostOverview(
  creds: ScholtCredentials,
  client: string,
  connectionReference: string,
  year: number,
  month?: number,
  apiBase = DEFAULT_API_BASE,
): Promise<ScholtCostOverviewLine[]> {
  const params: Record<string, string> = { year: String(year) };
  if (month !== undefined) params["month"] = String(month);
  const payload = (await apiGet(
    creds,
    apiBase,
    `/connection/${encodeURIComponent(client)}/${encodeURIComponent(connectionReference)}/costoverview/`,
    params,
  )) as { lines?: RawCostOverviewLine[] };
  return (payload.lines ?? []).map((l) => ({
    month: l.month,
    articleName: l.article_name,
    articleGroup: l.article_group,
    taxPercentage: l.taxpercentage ?? null,
    sliceFrom: l.slice_from ?? null,
    sliceTo: l.slice_to ?? null,
    quantity: l.quantity ?? null,
    amount: l.amount,
    taxAmount: l.taxamount ?? null,
    unitPrice: l.unitprice ?? null,
    extra: l.extra ?? null,
  }));
}
