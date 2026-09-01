import { fetchArchive, fetchForecast, type WeatherSlot } from "./client.js";
import { computeExpectedAcPowerKw, parsePvSystemConfiguration, type PvSystemConfiguration } from "./pv-model.js";
import type { MeasurementIngestionService } from "../../application/ingestion/measurement-ingestion.service.js";
import type { Asset } from "../../domain/assets/asset.js";
import type { ConnectorId, MeasurementPointId, SiteId, TenantId } from "../../domain/shared/ids.js";
import type { MeasurementQuality } from "../../domain/timeseries/measurement.js";
import type { AssetRepository } from "../../infrastructure/repositories/asset.repository.js";
import type { ConnectorRepository } from "../../infrastructure/repositories/connector.repository.js";
import type { SiteRepository } from "../../infrastructure/repositories/site.repository.js";

export interface OpenMeteoIngestDeps {
  readonly connectors: ConnectorRepository;
  readonly sites: SiteRepository;
  readonly assets: AssetRepository;
  readonly measurementIngestion: MeasurementIngestionService;
}

export interface OpenMeteoIngestResult {
  readonly weatherPointsIngested: number;
  readonly expectedPowerPointsIngested: number;
  readonly pvSystemsConfigured: number;
  readonly pvSystemsSkipped: number;
  /** Set when the pull did nothing at all (e.g. site has no coordinates yet) — not an error. */
  readonly skippedReason: string | null;
}

interface ConfiguredPvSystem {
  readonly asset: Asset;
  readonly config: PvSystemConfiguration;
}

type ResolvedContext =
  | {
      readonly kind: "ok";
      readonly siteId: SiteId;
      readonly latitude: number;
      readonly longitude: number;
      readonly configured: ConfiguredPvSystem[];
      readonly pvSystemsTotal: number;
    }
  | { readonly kind: "skip"; readonly reason: string };

const WEATHER_METRIC_KEYS = {
  gtiWm2: "irradiance",
  tAirC: "ambient_temperature",
  windMs: "wind_speed",
  cloudPct: "cloud_cover",
} as const;

/**
 * Pulls weather (forecast or ERA5 archive) for a site and writes both the raw weather variables
 * (on the site's weather MeasurementPoint) and, for every PV_SYSTEM asset with a valid
 * configuration, the derived expected AC power (pv-model.ts) as an expected_active_power
 * Measurement — reusing the existing MeasurementIngestionService unchanged (same principle as the
 * Wendeware connector: reuse the ingestion chain, don't duplicate it).
 *
 * Known simplification (documented, not silent): Global Tilted Irradiance is orientation-
 * dependent, but Open-Meteo needs one tilt/azimuth per request. This pulls weather ONCE per site,
 * using the first PV_SYSTEM's tilt/azimuth as representative orientation (or flat 0/0 if no
 * PV_SYSTEM is configured yet). A site with multiple differently-oriented PV_SYSTEM assets would
 * get a slightly-off GTI for every asset except the representative one — acceptable for the
 * single-orientation sites this MVP targets, revisit if that changes.
 */
export class OpenMeteoIngestService {
  constructor(
    private readonly deps: OpenMeteoIngestDeps,
    private readonly pastDays = 1,
    private readonly forecastDays = 2,
  ) {}

  /** Forecast API — near-term, quality reflects whether a slot is already-elapsed or still ahead. */
  async pull(
    tenantId: TenantId,
    connectorId: ConnectorId,
    weatherMeasurementPointId: MeasurementPointId,
  ): Promise<OpenMeteoIngestResult> {
    const ctx = await this.resolveContext(tenantId, connectorId);
    if (ctx.kind === "skip") return this.empty(ctx.reason);

    const reference = ctx.configured[0]?.config;
    const slots = await fetchForecast({
      latitude: ctx.latitude,
      longitude: ctx.longitude,
      tiltDegrees: reference?.tiltDegrees ?? 0,
      azimuthDegrees: reference?.azimuthDegrees ?? 0,
      pastDays: this.pastDays,
      forecastDays: this.forecastDays,
    });

    const now = new Date();
    const counts = await this.writeSlots(
      tenantId,
      connectorId,
      weatherMeasurementPointId,
      ctx.configured,
      slots,
      (slot) => (slot.timestamp <= now ? "MEASURED" : "ESTIMATED"),
    );

    return this.result(counts, ctx);
  }

  /**
   * ERA5 archive — retrospective, for curtailment analysis over date ranges outside the
   * Forecast API's practical lookback. Always MEASURED: reanalysis of already-elapsed time is an
   * authoritative reconstruction, not an estimate.
   */
  async pullArchive(
    tenantId: TenantId,
    connectorId: ConnectorId,
    weatherMeasurementPointId: MeasurementPointId,
    startDate: string,
    endDate: string,
  ): Promise<OpenMeteoIngestResult> {
    const ctx = await this.resolveContext(tenantId, connectorId);
    if (ctx.kind === "skip") return this.empty(ctx.reason);

    const reference = ctx.configured[0]?.config;
    const slots = await fetchArchive({
      latitude: ctx.latitude,
      longitude: ctx.longitude,
      tiltDegrees: reference?.tiltDegrees ?? 0,
      azimuthDegrees: reference?.azimuthDegrees ?? 0,
      startDate,
      endDate,
    });

    const counts = await this.writeSlots(
      tenantId,
      connectorId,
      weatherMeasurementPointId,
      ctx.configured,
      slots,
      () => "MEASURED",
    );

    return this.result(counts, ctx);
  }

  private async resolveContext(tenantId: TenantId, connectorId: ConnectorId): Promise<ResolvedContext> {
    const connector = await this.deps.connectors.findById(tenantId, connectorId);
    if (!connector) throw new Error(`Connector ${connectorId} not found`);
    if (!connector.siteId) throw new Error(`Connector ${connectorId} has no site`);

    const site = await this.deps.sites.findById(tenantId, connector.siteId);
    if (!site) throw new Error(`Site ${connector.siteId} not found`);
    if (site.latitude === null || site.longitude === null) {
      return { kind: "skip", reason: "Site has no latitude/longitude configured yet" };
    }

    const pvSystems = await this.deps.assets.findByTypeAndSite(tenantId, connector.siteId, "PV_SYSTEM");
    const configured: ConfiguredPvSystem[] = [];
    for (const asset of pvSystems) {
      const config = parsePvSystemConfiguration(asset.configuration);
      if (config) configured.push({ asset, config });
    }

    return {
      kind: "ok",
      siteId: connector.siteId,
      latitude: site.latitude,
      longitude: site.longitude,
      configured,
      pvSystemsTotal: pvSystems.length,
    };
  }

  private async writeSlots(
    tenantId: TenantId,
    connectorId: ConnectorId,
    weatherMeasurementPointId: MeasurementPointId,
    configured: readonly ConfiguredPvSystem[],
    slots: readonly WeatherSlot[],
    qualityFor: (slot: WeatherSlot) => MeasurementQuality,
  ): Promise<{ weatherPointsIngested: number; expectedPowerPointsIngested: number }> {
    let weatherPointsIngested = 0;
    for (const slot of slots) {
      for (const [field, metricKey] of Object.entries(WEATHER_METRIC_KEYS) as [keyof WeatherSlot, string][]) {
        await this.deps.measurementIngestion.ingest({
          tenantId,
          subjectType: "MEASUREMENT_POINT",
          assetId: null,
          componentId: null,
          measurementPointId: weatherMeasurementPointId,
          metricKey,
          timestamp: slot.timestamp,
          value: slot[field] as number,
          quality: qualityFor(slot),
          connectorId,
          vendorObjectId: "site-weather",
          vendorSensorId: metricKey,
        });
        weatherPointsIngested += 1;
      }
    }

    let expectedPowerPointsIngested = 0;
    for (const { asset, config } of configured) {
      for (const slot of slots) {
        const expectedKw = computeExpectedAcPowerKw({
          gtiWm2: slot.gtiWm2,
          tAirC: slot.tAirC,
          windMs: slot.windMs,
          kwp: config.nominalCapacityKwp,
          kwAc: config.acCapacityKw,
        });
        await this.deps.measurementIngestion.ingest({
          tenantId,
          subjectType: "ASSET",
          assetId: asset.id,
          componentId: null,
          measurementPointId: null,
          metricKey: "expected_active_power",
          timestamp: slot.timestamp,
          value: expectedKw,
          quality: "CALCULATED",
          connectorId,
          vendorObjectId: asset.id,
          vendorSensorId: "expected_active_power",
        });
        expectedPowerPointsIngested += 1;
      }
    }

    return { weatherPointsIngested, expectedPowerPointsIngested };
  }

  private result(
    counts: { weatherPointsIngested: number; expectedPowerPointsIngested: number },
    ctx: Extract<ResolvedContext, { kind: "ok" }>,
  ): OpenMeteoIngestResult {
    return {
      ...counts,
      pvSystemsConfigured: ctx.configured.length,
      pvSystemsSkipped: ctx.pvSystemsTotal - ctx.configured.length,
      skippedReason: null,
    };
  }

  private empty(reason: string): OpenMeteoIngestResult {
    return {
      weatherPointsIngested: 0,
      expectedPowerPointsIngested: 0,
      pvSystemsConfigured: 0,
      pvSystemsSkipped: 0,
      skippedReason: reason,
    };
  }
}
