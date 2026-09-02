import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchClients, fetchConnections, fetchCostOverview, fetchUsage } from "../../src/connectors/scholt/client.js";
import { toBasicAuthHeader } from "../../src/connectors/scholt/credentials.js";

const CREDS = { identifier: "7jw8xfaucssx", secret: "7ZiLF1A1oLE6dTlKNdJQuA" };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("toBasicAuthHeader", () => {
  it("matches the example from docs/data-requirements-scholt.md", () => {
    expect(toBasicAuthHeader(CREDS)).toBe("Basic N2p3OHhmYXVjc3N4OjdaaUxGMUExb0xFNmRUbEtOZEpRdUE=");
  });
});

describe("fetchClients", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses the clients list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ clients: [{ reference: "K00000001", name: "Test client" }] })),
    );
    const clients = await fetchClients(CREDS);
    expect(clients).toEqual([{ reference: "K00000001", name: "Test client" }]);
  });
});

describe("fetchConnections", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses the connections list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          connections: [
            { reference: "871111222233334444", utilitytype: "ele", meterreading: "AMR", client: "K00000001" },
          ],
        }),
      ),
    );
    const connections = await fetchConnections(CREDS, "K00000001");
    expect(connections).toEqual([
      { reference: "871111222233334444", utilitytype: "ele", meterreading: "AMR", client: "K00000001" },
    ]);
  });
});

describe("fetchUsage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps con_volume_peak/offpeak to camelCase, defaulting to null when absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          reference: "871111222233334444",
          interval: "yearly",
          usage: [
            {
              con_volume: 31096.0,
              con_volume_peak: 14336.0,
              con_volume_offpeak: 16760.0,
              datetime: "2025-01-01",
              unit: "kWh",
            },
          ],
        }),
      ),
    );
    const usage = await fetchUsage(CREDS, "K0000001", "871111222233334444", "yearly");
    expect(usage).toEqual([
      { datetime: "2025-01-01", unit: "kWh", conVolume: 31096, conVolumePeak: 14336, conVolumeOffpeak: 16760 },
    ]);
  });
});

describe("fetchCostOverview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses cost lines including tiered (slice_from/to) and extra fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          client: "K000001",
          connection: "841440000000000003",
          year: 2025,
          month: 8,
          lines: [
            {
              month: 8,
              article_name: "Energiebelasting",
              article_group: "Energiebelasting",
              taxpercentage: 21.0,
              slice_from: 0,
              slice_to: 10000,
              quantity: 10000.0,
              amount: 977.0,
              taxamount: 205.17,
              unitprice: 0.0977,
            },
            {
              month: 8,
              article_name: "Levering",
              article_group: "Energie",
              amount: 1200.5,
              extra: { utilitytariff: "peak" },
            },
          ],
        }),
      ),
    );

    const lines = await fetchCostOverview(CREDS, "K000001", "841440000000000003", 2025, 8);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      month: 8,
      articleName: "Energiebelasting",
      articleGroup: "Energiebelasting",
      taxPercentage: 21,
      sliceFrom: 0,
      sliceTo: 10000,
      quantity: 10000,
      amount: 977,
      taxAmount: 205.17,
      unitPrice: 0.0977,
      extra: null,
    });
    expect(lines[1]).toMatchObject({
      articleName: "Levering",
      articleGroup: "Energie",
      amount: 1200.5,
      extra: { utilitytariff: "peak" },
    });
  });

  it("throws with the response body on a non-OK HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"forbidden"}', { status: 403 })));
    await expect(fetchCostOverview(CREDS, "K1", "conn1", 2025)).rejects.toThrow(/HTTP 403/);
  });
});
