import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WendewareLiveScheduler } from "../../src/connectors/wendeware/live-scheduler.js";
import type { WendewareLiveIngestResult } from "../../src/connectors/wendeware/live-ingest.service.js";
import type { ConnectorId, TenantId } from "../../src/domain/shared/ids.js";

const TENANT_ID = "tenant-1" as TenantId;
const CONNECTOR_ID = "connector-1" as ConnectorId;

const FAKE_RESULT: WendewareLiveIngestResult = {
  emsCount: 1,
  sensorCount: 0,
  readingCount: 0,
  mapResult: { discovered: [], measurementsIngested: 0, controlIntentsIngested: 0, skippedSensors: 0 },
  sensorsByDevice: new Map(),
};

describe("WendewareLiveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pulls immediately on start(), then again after each interval", async () => {
    const pull = vi.fn().mockResolvedValue(FAKE_RESULT);
    const scheduler = new WendewareLiveScheduler({ pull }, TENANT_ID, CONNECTOR_ID, { intervalMs: 60_000 });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledWith(TENANT_ID, CONNECTOR_ID);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(pull).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(pull).toHaveBeenCalledTimes(3);

    scheduler.stop();
  });

  it("reports each result via onResult", async () => {
    const pull = vi.fn().mockResolvedValue(FAKE_RESULT);
    const onResult = vi.fn();
    const scheduler = new WendewareLiveScheduler({ pull }, TENANT_ID, CONNECTOR_ID, {
      intervalMs: 1000,
      onResult,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(onResult).toHaveBeenCalledWith(FAKE_RESULT);
    scheduler.stop();
  });

  it("does not stop the loop when a pull fails — reports via onError and keeps scheduling", async () => {
    const failure = new Error("network down");
    const pull = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(FAKE_RESULT);
    const onError = vi.fn();
    const scheduler = new WendewareLiveScheduler({ pull }, TENANT_ID, CONNECTOR_ID, {
      intervalMs: 1000,
      onError,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(failure);

    await vi.advanceTimersByTimeAsync(1000);
    expect(pull).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("stops scheduling further pulls once stop() is called", async () => {
    const pull = vi.fn().mockResolvedValue(FAKE_RESULT);
    const scheduler = new WendewareLiveScheduler({ pull }, TENANT_ID, CONNECTOR_ID, { intervalMs: 1000 });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).toHaveBeenCalledTimes(1);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("calling start() while already running does not trigger an extra pull", async () => {
    const pull = vi.fn().mockResolvedValue(FAKE_RESULT);
    const scheduler = new WendewareLiveScheduler({ pull }, TENANT_ID, CONNECTOR_ID, { intervalMs: 1000 });

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });
});
