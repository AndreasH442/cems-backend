import { describe, expect, it } from "vitest";
import { parseCurtailmentScopeConfiguration } from "../../src/application/curtailment/curtailment.service.js";
import type { AssetId } from "../../src/domain/shared/ids.js";

describe("parseCurtailmentScopeConfiguration", () => {
  it("parses a complete configuration", () => {
    expect(
      parseCurtailmentScopeConfiguration({
        gridConnectionAssetId: "grid-1",
        userConsumptionAssetId: "load-1",
      }),
    ).toEqual({ gridConnectionAssetId: "grid-1" as AssetId, userConsumptionAssetId: "load-1" as AssetId });
  });

  it("returns null when a field is missing", () => {
    expect(parseCurtailmentScopeConfiguration({ gridConnectionAssetId: "grid-1" })).toBeNull();
  });

  it("returns null when a field has the wrong type", () => {
    expect(
      parseCurtailmentScopeConfiguration({ gridConnectionAssetId: 42, userConsumptionAssetId: "load-1" }),
    ).toBeNull();
  });

  it("returns null for an empty configuration (curtailment auto-discovery not set up)", () => {
    expect(parseCurtailmentScopeConfiguration({})).toBeNull();
  });
});
