import { describe, expect, it } from "vitest";
import { classifyCurtailment } from "../../src/application/curtailment/classify-curtailment.js";

describe("classifyCurtailment", () => {
  it("finds no gap when actual matches expected and demand is high enough", () => {
    const result = classifyCurtailment(100, 100, 200);
    expect(result).toEqual({ maxUsableKwh: 100, regelungsGapKwh: 0, designGapKwh: 0 });
  });

  it("classifies a shortfall as recoverable (regelungsGap) when demand could have absorbed more", () => {
    // Site could have used up to 100 kWh, weather allowed 100 kWh, only 60 kWh was generated.
    const result = classifyCurtailment(60, 100, 200);
    expect(result).toEqual({ maxUsableKwh: 100, regelungsGapKwh: 40, designGapKwh: 0 });
  });

  it("classifies the unabsorbable surplus as structural (designGap) when demand is the limiting factor", () => {
    // Weather allowed 150 kWh, but the site could only ever have absorbed 80 kWh that day.
    const result = classifyCurtailment(80, 150, 80);
    expect(result).toEqual({ maxUsableKwh: 80, regelungsGapKwh: 0, designGapKwh: 70 });
  });

  it("splits both a recoverable and a structural gap in the same day", () => {
    // Demand ceiling 90, weather allowed 150 -> maxUsable=90, design gap 60. Actual only 50 -> recoverable 40.
    const result = classifyCurtailment(50, 150, 90);
    expect(result).toEqual({ maxUsableKwh: 90, regelungsGapKwh: 40, designGapKwh: 60 });
  });

  it("never returns negative gaps even if actual exceeds expected (e.g. measurement noise)", () => {
    const result = classifyCurtailment(120, 100, 200);
    expect(result.regelungsGapKwh).toBe(0);
    expect(result.designGapKwh).toBe(0);
  });

  it("handles all-zero inputs without dividing by zero or going negative", () => {
    const result = classifyCurtailment(0, 0, 0);
    expect(result).toEqual({ maxUsableKwh: 0, regelungsGapKwh: 0, designGapKwh: 0 });
  });
});
