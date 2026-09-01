import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCredentialsFromEnv } from "../../src/connectors/wendeware/credentials.js";
import { parseLatestValuesResponse } from "../../src/connectors/wendeware/live-client.js";

// Synthetic payloads shaped like the confirmed myPowerGrid response format
// (docs/data-requirements.md) — no real customer data.
describe("parseLatestValuesResponse", () => {
  it("takes the latest non-null value per sensor", () => {
    const payload = {
      data: {
        attributes: {
          datetimes: ["2026-09-01T10:00:00Z", "2026-09-01T10:01:00Z", "2026-09-01T10:02:00Z"],
          "sensor-1": [1.1, 1.2, 1.3],
          "sensor-2": [5, 6, 7],
        },
      },
    };
    const readings = parseLatestValuesResponse(payload, ["sensor-1", "sensor-2"]);
    expect(readings).toEqual([
      { sensorId: "sensor-1", value: 1.3, timestamp: "2026-09-01T10:02:00Z" },
      { sensorId: "sensor-2", value: 7, timestamp: "2026-09-01T10:02:00Z" },
    ]);
  });

  it("skips trailing nulls and uses the latest present value (late-arriving data gap)", () => {
    const payload = {
      data: {
        attributes: {
          datetimes: ["2026-09-01T10:00:00Z", "2026-09-01T10:01:00Z", "2026-09-01T10:02:00Z"],
          "sensor-1": [2.5, 2.6, null],
        },
      },
    };
    const readings = parseLatestValuesResponse(payload, ["sensor-1"]);
    expect(readings).toEqual([{ sensorId: "sensor-1", value: 2.6, timestamp: "2026-09-01T10:01:00Z" }]);
  });

  it("omits a sensor entirely when it has no values at all", () => {
    const payload = {
      data: {
        attributes: {
          datetimes: ["2026-09-01T10:00:00Z"],
          "sensor-1": [null],
        },
      },
    };
    expect(parseLatestValuesResponse(payload, ["sensor-1", "sensor-2"])).toEqual([]);
  });

  it("handles a malformed/empty payload without throwing", () => {
    expect(parseLatestValuesResponse({}, ["sensor-1"])).toEqual([]);
    expect(parseLatestValuesResponse(undefined, ["sensor-1"])).toEqual([]);
  });
});

describe("resolveCredentialsFromEnv", () => {
  const CLIENT_ID_VAR = "TEST_MPG_CLIENT_ID";
  const CLIENT_SECRET_VAR = "TEST_MPG_CLIENT_SECRET";

  beforeEach(() => {
    process.env[CLIENT_ID_VAR] = "test-client-id";
    process.env[CLIENT_SECRET_VAR] = "test-client-secret";
  });

  afterEach(() => {
    delete process.env[CLIENT_ID_VAR];
    delete process.env[CLIENT_SECRET_VAR];
  });

  it("resolves both env vars from the env:X,env:Y convention", () => {
    const creds = resolveCredentialsFromEnv(`env:${CLIENT_ID_VAR},env:${CLIENT_SECRET_VAR}`);
    expect(creds).toEqual({ clientId: "test-client-id", clientSecret: "test-client-secret" });
  });

  it("rejects a secret_reference without the env: prefix", () => {
    expect(() => resolveCredentialsFromEnv(`${CLIENT_ID_VAR},env:${CLIENT_SECRET_VAR}`)).toThrow(/env:/);
  });

  it("rejects a secret_reference that isn't exactly two parts", () => {
    expect(() => resolveCredentialsFromEnv(`env:${CLIENT_ID_VAR}`)).toThrow();
  });

  it("throws when the referenced env var is not set", () => {
    delete process.env[CLIENT_ID_VAR];
    expect(() => resolveCredentialsFromEnv(`env:${CLIENT_ID_VAR},env:${CLIENT_SECRET_VAR}`)).toThrow(/not set/);
  });
});
