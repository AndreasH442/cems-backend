import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/infrastructure/db/kysely.js";
import { AssetRepository } from "../../src/infrastructure/repositories/asset.repository.js";
import { ConnectorRepository } from "../../src/infrastructure/repositories/connector.repository.js";
import { MetricDefinitionRepository } from "../../src/infrastructure/repositories/metric-definition.repository.js";
import { VendorMetricMappingRepository } from "../../src/infrastructure/repositories/vendor-metric-mapping.repository.js";
import { VendorObjectMappingRepository } from "../../src/infrastructure/repositories/vendor-object-mapping.repository.js";
import { createTenantWithSite } from "./support/factories.js";
import { getTestDb, resetDatabase, stopTestDb } from "./support/test-db.js";

describe("connector / vendor mapping repositories", () => {
  let db: Db;
  let connectors: ConnectorRepository;
  let assets: AssetRepository;
  let objectMappings: VendorObjectMappingRepository;
  let metricMappings: VendorMetricMappingRepository;
  let metricDefinitions: MetricDefinitionRepository;

  beforeAll(async () => {
    db = await getTestDb();
    connectors = new ConnectorRepository(db);
    assets = new AssetRepository(db);
    objectMappings = new VendorObjectMappingRepository(db);
    metricMappings = new VendorMetricMappingRepository(db);
    metricDefinitions = new MetricDefinitionRepository(db);
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  it("discovers a vendor object as DISCOVERED with no target, then maps it to an asset", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Wendeware Site Connector",
      secretReference: "secret-store://wendeware/site-1",
      siteId: site.id,
    });

    const discovered = await objectMappings.discover({
      tenantId: tenant.id,
      connectorId: connector.id,
      vendorObjectId: "bat.1",
    });
    expect(discovered.mappingStatus).toBe("DISCOVERED");
    expect(discovered.targetAssetId).toBeNull();

    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie 1",
    });

    const mapped = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: discovered.id,
      targetAssetId: battery.id,
      mappingStatus: "MANUAL_MAPPED",
    });
    expect(mapped.mappingStatus).toBe("MANUAL_MAPPED");
    expect(mapped.targetAssetId).toBe(battery.id);

    const soc = await metricDefinitions.findByKey("state_of_charge");
    const sensorMapping = await metricMappings.insert({
      tenantId: tenant.id,
      vendorObjectMappingId: mapped.id,
      vendorSensorId: "soc",
      metricDefinitionId: soc!.id,
    });
    expect(sensorMapping.unitFactor).toBe(1);
    expect(sensorMapping.signMultiplier).toBe(1);
  });

  it("rejects a mapping_status outside the six-value registry", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });

    await expect(
      db
        .insertInto("vendor_object_mappings")
        .values({
          tenant_id: tenant.id,
          connector_id: connector.id,
          vendor_object_id: "bat.1",
          mapping_status: "MAPPED",
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("rejects a DISCOVERED row that already carries a target (no target allowed, docs/domain-model.md)", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie",
    });

    await expect(
      db
        .insertInto("vendor_object_mappings")
        .values({
          tenant_id: tenant.id,
          connector_id: connector.id,
          vendor_object_id: "bat.2",
          mapping_status: "DISCOVERED",
          target_type: "ASSET",
          target_asset_id: battery.id,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("rejects a sign_multiplier other than 1 or -1", async () => {
    const { tenant, site } = await createTenantWithSite(db);
    const connector = await connectors.insert({
      tenantId: tenant.id,
      vendorType: "WENDEWARE",
      name: "Connector",
      secretReference: "secret-store://x",
      siteId: site.id,
    });
    const battery = await assets.insert({
      tenantId: tenant.id,
      siteId: site.id,
      assetType: "BATTERY_SYSTEM",
      name: "Batterie",
    });
    const mapped = await objectMappings.mapToAsset({
      tenantId: tenant.id,
      id: (await objectMappings.discover({ tenantId: tenant.id, connectorId: connector.id, vendorObjectId: "bat.3" }))
        .id,
      targetAssetId: battery.id,
      mappingStatus: "AUTO_MAPPED",
    });
    const soc = await metricDefinitions.findByKey("state_of_charge");

    await expect(
      db
        .insertInto("vendor_metric_mappings")
        .values({
          tenant_id: tenant.id,
          vendor_object_mapping_id: mapped.id,
          vendor_sensor_id: "soc",
          metric_definition_id: soc!.id,
          sign_multiplier: 2,
        })
        .execute(),
    ).rejects.toThrow();
  });
});
