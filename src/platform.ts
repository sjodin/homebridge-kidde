import { PlatformAccessory, type API, type Characteristic,
  type DynamicPlatformPlugin, type Logging, type PlatformConfig, type Service } from 'homebridge';

import { KiddeSmokeCOAlarm } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { readFileSync, writeFileSync } from 'node:fs';

// This is only required when using Custom Services and Characteristics not support by HomeKit
import { KiddeClient } from './kiddeclient.js';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class KiddeHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  public readonly discoveredCacheUUIDs: string[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.platform);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      setImmediate(this.discoverDevices.bind(this));
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.set(accessory.UUID, accessory);
  }

  async discoverDevices() {
    let client: KiddeClient;
    if (this.config!.cookies) {
      client = new KiddeClient(this.config.cookies);
    } else {
      client = await KiddeClient.fromLogin(this.config.username, this.config.password);
      const { pluginConfig, currentConfig } = await this.pluginConfig();
      pluginConfig.cookies = client.cookies;
      writeFileSync(this.api.user.configPath(), JSON.stringify(currentConfig, null, 4));
    }
    const data = await client.getData();
    // loop over the discovered devices and register each one if it has not already been registered
    if (data.devices) {
      for (const [deviceId, device] of Object.entries(data.devices)) {
        const uuid = this.api.hap.uuid.generate('kidde-' + device.location_id + '-' + deviceId);

        const existingAccessory = this.accessories.get(uuid);

        if (existingAccessory) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          new KiddeSmokeCOAlarm(this, client, device.id as number, device.location_id as number, existingAccessory);
        } else {
          this.log.info('Adding new accessory:', device.label);
          const accessory = new this.api.platformAccessory(device.label as string, uuid);
          this.configureAccessory(accessory);
          accessory.context.device = device;

          new KiddeSmokeCOAlarm(this, client, device.id as number, device.location_id as number, accessory);

          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }

        this.discoveredCacheUUIDs.push(uuid);
      }
    }
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('Removing existing accessory from cache:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
  async pluginConfig() {
    const currentConfig = JSON.parse(readFileSync(this.api.user.configPath(), 'utf8'));
    // check the platforms section is an array before we do array things on it
    if (!Array.isArray(currentConfig.platforms)) {
      throw new TypeError('Cannot find platforms array in config');
    }
    // find this plugins current config
    const pluginConfig = currentConfig.platforms.find((x: { platform: string }) => x.platform === PLATFORM_NAME);
    if (!pluginConfig) {
      throw new Error(`Cannot find config for ${PLATFORM_NAME} in platforms array`);
    }
    // check the .credentials is an object before doing object things with it
    if (!(typeof pluginConfig.cookies == 'object' || typeof pluginConfig.cookies == 'undefined')) {
      throw new TypeError('pluginConfig.cookies is not an object');
    }
    return { pluginConfig, currentConfig };
  }
}
