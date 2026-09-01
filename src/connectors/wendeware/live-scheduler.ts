import type { ConnectorId, TenantId } from "../../domain/shared/ids.js";
import type { WendewareLiveIngestResult, WendewareLiveIngestService } from "./live-ingest.service.js";

export interface WendewareLiveSchedulerOptions {
  /** Fixed delay between pulls, measured from when the previous pull finished, not a cron expression. */
  readonly intervalMs: number;
  readonly onResult?: (result: WendewareLiveIngestResult) => void;
  /** A failed pull never stops the loop — it's logged here and the next pull is still scheduled. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Repeated-pull wrapper around WendewareLiveIngestService.pull() (docs/first-vertical-slice.md
 * originally scoped the live client as "run once, repeated invocation is the caller's concern" —
 * this class is that caller). Deliberately a plain fixed-interval loop, not a cron-expression
 * scheduler: nothing about "pull again every N minutes" needs cron syntax.
 *
 * Schedules the next pull only after the current one settles (success or failure), never on a
 * fixed wall-clock tick — so a slow pull can't cause overlapping concurrent pulls.
 */
export class WendewareLiveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    private readonly liveIngest: Pick<WendewareLiveIngestService, "pull">,
    private readonly tenantId: TenantId,
    private readonly connectorId: ConnectorId,
    private readonly options: WendewareLiveSchedulerOptions,
  ) {}

  /** Idempotent — calling start() while already running does nothing. Pulls immediately. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.tick();
  }

  /** Stops after the in-flight pull (if any) settles; does not abort it. */
  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const result = await this.liveIngest.pull(this.tenantId, this.connectorId);
      this.options.onResult?.(result);
    } catch (error) {
      this.options.onError?.(error);
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => void this.tick(), this.options.intervalMs);
    }
  }
}
