/**
 * Ad-hoc, read-only exploration of the myPowerGrid API beyond what's already confirmed in
 * docs/data-requirements.md — specifically: find the "gauge-like" counterpart to the confirmed
 * `.../seqs/energy_mm_counter_seqs` endpoint (SoC, voltage, current, power, ...).
 *
 * No hardcoded customer-specific IDs — everything is discovered at runtime via the API itself.
 * Never runs in CI. Requires MPG_CLIENT_ID/MPG_CLIENT_SECRET in .env.
 */
import { config } from "dotenv";
config();

import { fetchAccessToken, listEnergyManagementSystems } from "../src/connectors/wendeware/live-client.js";
import { CONFIRMED_COUNTER_SENSOR_TYPE_IDS } from "../src/connectors/wendeware/live-ingest.service.js";

const API_BASE = "https://www.mypowergrid.de/api/v1/customer";

interface JsonApiResource {
  readonly id: string;
  readonly type?: string;
  readonly attributes?: Record<string, unknown>;
  readonly relationships?: Record<string, { data?: { id: string; type?: string } | null }>;
}

async function rawGet(token: string, path: string, params: Record<string, string>) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json" } });
  const text = await resp.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: resp.status, ok: resp.ok, text, json };
}

async function main(): Promise<void> {
  const clientId = process.env["MPG_CLIENT_ID"];
  const clientSecret = process.env["MPG_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    console.error("MPG_CLIENT_ID / MPG_CLIENT_SECRET not set (.env)");
    process.exitCode = 1;
    return;
  }

  const token = await fetchAccessToken({ clientId, clientSecret });
  const emsList = await listEnergyManagementSystems(token);
  console.log(`EMS gefunden: ${emsList.length}`);
  if (emsList.length === 0) return;
  const emsId = emsList[0]!.id;

  console.log("");
  console.log("=== Schritt 1: Was sagt die API zu einem offensichtlich falschen 'type'? ===");
  const bogus = await rawGet(token, "/sensors/measurements/seqs/not_a_real_type_xyz", {
    "filter[sensorIds]": "0",
    "filter[tFilter][dateFrom]": new Date(Date.now() - 60_000).toISOString(),
    "filter[tFilter][dateTo]": new Date().toISOString(),
    "filter[resolution]": "1 minute",
    "filter[tz]": "Europe/Berlin",
  });
  console.log(`HTTP ${bogus.status}: ${bogus.text.slice(0, 1000)}`);

  console.log("");
  console.log("=== Schritt 2: Alle real vorhandenen sensor_type.typeId-Kategorien (kind=16, ungefiltert) ===");
  const all = await rawGet(token, "/sensors", { "filter[ems_ids]": emsId, "filter[kind]": "16" });
  const data = ((all.json as { data?: JsonApiResource[] })?.data ?? []) as JsonApiResource[];
  const included = ((all.json as { included?: JsonApiResource[] })?.included ?? []) as JsonApiResource[];
  const sensorTypeLookup = new Map<string, string>();
  for (const inc of included) {
    if (inc.type === "sensor_types") {
      sensorTypeLookup.set(inc.id, (inc.attributes?.["typeId"] as string | undefined) ?? "?");
    }
  }
  const typeIdToSensorId = new Map<string, string>();
  for (const sensor of data) {
    const sensorTypeRelId = sensor.relationships?.["sensorType"]?.data?.id;
    const typeId = sensorTypeRelId ? (sensorTypeLookup.get(sensorTypeRelId) ?? "unknown") : "unknown";
    if (!typeIdToSensorId.has(typeId)) typeIdToSensorId.set(typeId, sensor.id);
  }
  console.log(`Gefundene Kategorien (${typeIdToSensorId.size}):`);
  for (const [typeId, sensorId] of typeIdToSensorId) {
    const known = (CONFIRMED_COUNTER_SENSOR_TYPE_IDS as readonly string[]).includes(typeId)
      ? " (bestaetigt: counter)"
      : "";
    console.log(`  ${typeId}${known}  [Beispiel-Sensor: ${sensorId}]`);
  }

  const gaugeTypeId = "battery_soc";
  const gaugeSensorId = typeIdToSensorId.get(gaugeTypeId);
  if (!gaugeSensorId) {
    console.log("");
    console.log(`Keine Sensoren vom Typ '${gaugeTypeId}' in dieser Antwort — Schritt 3 uebersprungen.`);
    return;
  }

  console.log("");
  console.log(`=== Schritt 3: 'avg_mm_gauge_seqs' gegen einen '${gaugeTypeId}'-Sensor testen ===`);
  const res = await rawGet(token, "/sensors/measurements/seqs/avg_mm_gauge_seqs", {
    "filter[sensorIds]": gaugeSensorId,
    "filter[tFilter][dateFrom]": new Date(Date.now() - 60_000).toISOString(),
    "filter[tFilter][dateTo]": new Date().toISOString(),
    "filter[resolution]": "1 minute",
    "filter[tz]": "Europe/Berlin",
  });
  console.log(`  HTTP ${res.status}${res.ok ? "  <-- TREFFER" : ""}`);
  console.log(`  ${res.text.slice(0, 500)}`);

  console.log("");
  console.log("=== Schritt 4: sind battery_meter_supply/demand wirklich counter-like? ===");
  for (const typeId of ["battery_meter_supply", "battery_meter_demand"]) {
    const sensorId = typeIdToSensorId.get(typeId);
    if (!sensorId) continue;
    const check = await rawGet(token, "/sensors/measurements/seqs/energy_mm_counter_seqs", {
      "filter[sensorIds]": sensorId,
      "filter[tFilter][dateFrom]": new Date(Date.now() - 60_000).toISOString(),
      "filter[tFilter][dateTo]": new Date().toISOString(),
      "filter[resolution]": "1 minute",
      "filter[tz]": "Europe/Berlin",
    });
    console.log(
      `  ${typeId}: HTTP ${check.status}${check.ok ? " -> counter-like, bestaetigt" : " -> NICHT counter-like"}`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
