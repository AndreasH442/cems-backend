import type { Measurement } from "../../domain/timeseries/measurement.js";

/** [start, end) for the UTC calendar day containing `day` — shared by any day-window energy computation. */
export function dayBounds(day: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Last minus first reading in the window — the standard way to turn a cumulative `_total` counter into an interval energy value (docs/canonical-metrics.md). 0 when fewer than two readings exist — documented simplification, not an error. */
export function counterDiffKwh(rows: readonly Measurement[]): number {
  if (rows.length < 2) return 0;
  return rows[rows.length - 1]!.value - rows[0]!.value;
}
