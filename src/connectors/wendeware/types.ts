/**
 * Vendor-internal shapes. Prefixes (bat./inv./ch./ctl./mtr./ec./pv./pvp./prc.) and any other
 * Wendeware-specific structure live ONLY in this module (CLAUDE.md) and are never interpreted
 * semantically beyond what docs/data-requirements.md documents — an object id like "bat.1" is
 * stored and passed through, never parsed to *infer* an asset type.
 */
export interface WendewareSensorReading {
  readonly sensorId: string;
  readonly value: number;
  /** ISO 8601 */
  readonly timestamp: string;
}

export interface WendewareObjectPayload {
  readonly objectId: string;
  readonly sensors: readonly WendewareSensorReading[];
}

export interface WendewareFixture {
  readonly objects: readonly WendewareObjectPayload[];
}
