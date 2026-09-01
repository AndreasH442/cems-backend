/**
 * Curtailment classification: recoverable (Regelung) vs. structural (Design) — ported from a
 * separately validated reference implementation (docs/data-requirements-open-meteo.md,
 * energiecockpit/backend/app/services/curtailment.py). Pure, stateless, no I/O.
 *
 * maxUsable  = min(expectedPvKwh, verbrauchKwh) — the site could only ever have absorbed this much.
 * regelungsGapKwh = max(0, maxUsable - actualPvKwh) — usable demand existed but wasn't generated;
 *   recoverable with better dispatch/storage (the economic lever).
 * designGapKwh    = max(0, expectedPvKwh - maxUsable) — more was physically possible than the site
 *   could ever have absorbed that day; not recoverable — the honest answer for why a bigger plant
 *   wouldn't help.
 */
export interface CurtailmentClassification {
  readonly maxUsableKwh: number;
  readonly regelungsGapKwh: number;
  readonly designGapKwh: number;
}

export function classifyCurtailment(
  actualPvKwh: number,
  expectedPvKwh: number,
  verbrauchKwh: number,
): CurtailmentClassification {
  const maxUsableKwh = Math.min(expectedPvKwh, verbrauchKwh);
  return {
    maxUsableKwh,
    regelungsGapKwh: Math.max(0, maxUsableKwh - actualPvKwh),
    designGapKwh: Math.max(0, expectedPvKwh - maxUsableKwh),
  };
}
