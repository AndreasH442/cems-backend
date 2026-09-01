import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchForecast } from "../../src/connectors/open-meteo/client.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("fetchForecast", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses minutely_15 slots and converts local time + utc_offset_seconds to an absolute UTC instant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          utc_offset_seconds: 7200, // Europe/Berlin summer time, UTC+2
          minutely_15: {
            time: ["2026-07-01T12:00", "2026-07-01T12:15"],
            global_tilted_irradiance: [650.5, 680.2],
            temperature_2m: [24.1, 24.3],
            wind_speed_10m: [3.2, 3.5],
            cloud_cover: [10, 15],
          },
        }),
      ),
    );

    const slots = await fetchForecast({
      latitude: 48.9,
      longitude: 11.2,
      tiltDegrees: 10,
      azimuthDegrees: 0,
      pastDays: 0,
      forecastDays: 1,
    });

    expect(slots).toHaveLength(2);
    // 12:00 local (UTC+2) -> 10:00 UTC
    expect(slots[0]?.timestamp.toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(slots[0]?.gtiWm2).toBe(650.5);
    expect(slots[0]?.tAirC).toBe(24.1);
    expect(slots[0]?.windMs).toBe(3.2);
    expect(slots[0]?.cloudPct).toBe(10);
    expect(slots[1]?.timestamp.toISOString()).toBe("2026-07-01T10:15:00.000Z");
  });

  it("treats a null value in a weather column as 0, not a crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          utc_offset_seconds: 0,
          minutely_15: {
            time: ["2026-07-01T00:00"],
            global_tilted_irradiance: [null],
            temperature_2m: [null],
            wind_speed_10m: [null],
            cloud_cover: [null],
          },
        }),
      ),
    );

    const slots = await fetchForecast({
      latitude: 48.9,
      longitude: 11.2,
      tiltDegrees: 10,
      azimuthDegrees: 0,
      pastDays: 0,
      forecastDays: 1,
    });

    expect(slots[0]).toMatchObject({ gtiWm2: 0, tAirC: 0, windMs: 0, cloudPct: 0 });
  });

  it("throws with the response body on a non-OK HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));

    await expect(
      fetchForecast({ latitude: 0, longitude: 0, tiltDegrees: 0, azimuthDegrees: 0, pastDays: 0, forecastDays: 1 }),
    ).rejects.toThrow(/HTTP 400/);
  });
});
