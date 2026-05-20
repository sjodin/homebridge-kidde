import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { KiddeHomebridgePlatform } from './platform.js';
import { KiddeClient } from './kiddeclient.js';

export class KiddeSmokeCOAlarm {
  private airQualityService : Service | undefined;
  private coService : Service | undefined;
  private humidityService : Service | undefined;
  private smokeService : Service | undefined;
  private temperatureService : Service | undefined;
  private batteryService : Service | undefined;
  private loggedUnexpectedEndOfLifeStatus = false;
  constructor(protected platform: KiddeHomebridgePlatform,
        protected client: KiddeClient,
        protected device_id: number,
        protected location_id: number,
        protected accessory: PlatformAccessory,
  ) {
    client.registerCallback(this.update.bind(this));
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Kidde')
        .setCharacteristic(this.platform.Characteristic.Model, this.client.devices![this.device_id].model as string)
        .setCharacteristic(this.platform.Characteristic.SerialNumber, this.client.devices![this.device_id].serial_number as string);

      if ((this.client.devices![this.device_id].cap_sensor as Array<string>).includes('IAQ')) {
        this.airQualityService = this.accessory.getService(this.platform.Service.AirQualitySensor) ||
          this.accessory.addService(this.platform.Service.AirQualitySensor);
        this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality)
          .onGet(this.handleAirQualityGet.bind(this));
        this.airQualityService.getCharacteristic(this.platform.Characteristic.VOCDensity)
          .onGet(this.handleVocDensityGet.bind(this));
        this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
          this.accessory.addService(this.platform.Service.HumiditySensor);
        this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
          .onGet(this.handleHumidityGet.bind(this));
      }
      this.batteryService = this.accessory.getService(this.platform.Service.Battery) ||
      this.accessory.addService(this.platform.Service.Battery);
      this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .onGet(this.handleBatteryGet.bind(this));
      this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
        .onGet(this.handleBatteryLevelGet.bind(this));
      this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState)
        .updateValue(this.platform.Characteristic.ChargingState.NOT_CHARGEABLE);
      if ((this.client.devices![this.device_id].cap_sensor as Array<string>).includes('CO')) {
        this.coService = this.accessory.getService(this.platform.Service.CarbonMonoxideSensor) ||
          this.accessory.addService(this.platform.Service.CarbonMonoxideSensor);
        this.coService.getCharacteristic(this.platform.Characteristic.CarbonMonoxideDetected)
          .onGet(this.handleCarbonMonoxideDetectedGet.bind(this));
        this.coService.getCharacteristic(this.platform.Characteristic.StatusActive)
          .onGet(this.handleStatusActiveGet.bind(this));
        this.coService.getCharacteristic(this.platform.Characteristic.StatusFault)
          .onGet(this.handleStatusFaultGet.bind(this));
      }

      if ((this.client.devices![this.device_id].cap_sensor as Array<string>).includes('Smoke')) {
        this.smokeService = this.accessory.getService(this.platform.Service.SmokeSensor) ||
          this.accessory.addService(this.platform.Service.SmokeSensor);
        this.smokeService.getCharacteristic(this.platform.Characteristic.SmokeDetected)
          .onGet(this.handleSmokeDetectedGet.bind(this));
        this.smokeService.getCharacteristic(this.platform.Characteristic.StatusActive)
          .onGet(this.handleStatusActiveGet.bind(this));
        this.smokeService.getCharacteristic(this.platform.Characteristic.StatusFault)
          .onGet(this.handleStatusFaultGet.bind(this));
      }

      if ((this.client.devices![this.device_id].capabilities as Array<string>).includes('temperature')) {
        this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
          this.accessory.addService(this.platform.Service.TemperatureSensor);
        this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .onGet(this.handleTemperatureGet.bind(this));
      }
      this.logUnexpectedEndOfLifeStatus(this.client.devices![this.device_id]);
  }

  private update(oldData: Record<number, Record<string, unknown>> | undefined, newData: Record<number, Record<string, unknown>>) {
    if (this.airQualityService && oldData && 
        (oldData![this.device_id].iaq as {status: string}).status !== (newData![this.device_id].iaq as {status: string}).status) {
      this.airQualityService.updateCharacteristic(this.platform.Characteristic.AirQuality,
        this.convertAirQuality((newData![this.device_id].iaq as {status: string}).status));
    }
    if (this.batteryService && oldData && 
      oldData![this.device_id].battery_state !== newData![this.device_id].battery_state) {
      this.batteryService.updateCharacteristic(this.platform.Characteristic.StatusLowBattery,
        this.convertBattery(newData![this.device_id].battery_state as string));
      this.batteryService.updateCharacteristic(this.platform.Characteristic.BatteryLevel,
        this.convertBatteryLevel(newData![this.device_id].battery_state as string));
    }
    if (this.coService && oldData &&
        oldData![this.device_id].co_alarm !== newData![this.device_id].co_alarm) {
      this.coService.updateCharacteristic(this.platform.Characteristic.CarbonMonoxideDetected,
        this.convertCarbonMonoxideDetected(newData![this.device_id].co_alarm as boolean));
    }
    if (this.coService && oldData && this.didStatusFaultStateChange(oldData![this.device_id], newData![this.device_id])) {
      this.updateStatusCharacteristics(this.coService, newData![this.device_id]);
    }
    if (this.humidityService && oldData &&
        (oldData![this.device_id].humidity as {value: number}).value !== (newData![this.device_id].humidity as {value: number}).value) {
      this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity,
        (newData![this.device_id].humidity as {value: number}).value);
    }
    if (this.smokeService && oldData && 
        oldData![this.device_id].smoke_alarm !== newData![this.device_id].smoke_alarm) {
      this.smokeService.updateCharacteristic(this.platform.Characteristic.SmokeDetected,
        this.convertSmokeDetected(newData![this.device_id].smoke_alarm as boolean));
    }
    if (this.smokeService && oldData && this.didStatusFaultStateChange(oldData![this.device_id], newData![this.device_id])) {
      this.updateStatusCharacteristics(this.smokeService, newData![this.device_id]);
    }
    if (this.temperatureService && oldData && 
      (oldData![this.device_id].iaq_temperature as {value: number}).value !== (newData![this.device_id].iaq_temperature as {value: number}).value) {
      const iaq_temperature = newData![this.device_id].iaq_temperature as {Unit: string, value: number};
      if (iaq_temperature.Unit === 'F') {
        this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature,
          ((newData![this.device_id].iaq_temperature as {value: number}).value - 32) * 5 / 9);
      } else {
        this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature,
          (newData![this.device_id].iaq_temperature as {value: number}).value);
      }
    }
    if (this.airQualityService && oldData && 
        (oldData![this.device_id].tvoc as {value: number}).value !== (newData![this.device_id].tvoc as {value: number}).value) {
      this.airQualityService.updateCharacteristic(this.platform.Characteristic.VOCDensity,
        this.convertVoc((newData![this.device_id].tvoc as {value: number}).value));
    }
    this.logUnexpectedEndOfLifeStatus(newData![this.device_id]);
  }

  async handleAirQualityGet(): Promise<CharacteristicValue> {
    return this.convertAirQuality((this.client.devices![this.device_id].iaq as {status: string}).status);
  }

  private convertAirQuality(status: string) : CharacteristicValue {
    switch (status) {
    case 'Excellent': {
      return this.platform.Characteristic.AirQuality.EXCELLENT;
    }
    case 'Good': {
      return this.platform.Characteristic.AirQuality.GOOD;
    }
    case 'Moderate': {
      return this.platform.Characteristic.AirQuality.FAIR;
    }
    case 'Bad': {
      return this.platform.Characteristic.AirQuality.INFERIOR;
    }
    case 'Very Bad': {
      return this.platform.Characteristic.AirQuality.POOR;
    }
    default: {
      break;
    }
    }
    return this.platform.Characteristic.AirQuality.UNKNOWN;
  }

  async handleBatteryGet(): Promise<CharacteristicValue> {
    return this.convertBattery(this.client.devices![this.device_id].battery_state as string);
  }

  private convertBattery(battery_state: string) : CharacteristicValue {
    if (battery_state === 'ok') {
      return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
    }
    return this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
  }

  async handleBatteryLevelGet(): Promise<CharacteristicValue> {
    return this.convertBatteryLevel(this.client.devices![this.device_id].battery_state as string);
  }

  private convertBatteryLevel(battery_state: string) : CharacteristicValue {
    if (battery_state === 'ok') {
      return 100;
    }
    return 10;
  }

  async handleStatusActiveGet(): Promise<CharacteristicValue> {
    return this.isDeviceActive(this.client.devices![this.device_id]);
  }

  async handleStatusFaultGet(): Promise<CharacteristicValue> {
    return this.convertStatusFault(this.client.devices![this.device_id]);
  }

  private didStatusFaultStateChange(oldDevice: Record<string, unknown>, newDevice: Record<string, unknown>) {
    return oldDevice.offline !== newDevice.offline ||
      oldDevice.lost !== newDevice.lost ||
      oldDevice.contact_lost !== newDevice.contact_lost ||
      oldDevice.life !== newDevice.life ||
      oldDevice.end_of_life_status !== newDevice.end_of_life_status;
  }

  private updateStatusCharacteristics(service: Service, device: Record<string, unknown>) {
    service.updateCharacteristic(this.platform.Characteristic.StatusActive, this.isDeviceActive(device));
    service.updateCharacteristic(this.platform.Characteristic.StatusFault, this.convertStatusFault(device));
  }

  private isDeviceActive(device: Record<string, unknown>) : CharacteristicValue {
    return !this.hasConnectionFault(device);
  }

  private convertStatusFault(device: Record<string, unknown>) : CharacteristicValue {
    if (this.hasConnectionFault(device) || this.isEndOfLife(device)) {
      return this.platform.Characteristic.StatusFault.GENERAL_FAULT;
    }
    return this.platform.Characteristic.StatusFault.NO_FAULT;
  }

  private hasConnectionFault(device: Record<string, unknown>) {
    return device.offline === true || device.lost === true || device.contact_lost === true;
  }

  private isEndOfLife(device: Record<string, unknown>) {
    return typeof device.life === 'number' && device.life <= 0;
  }

  private logUnexpectedEndOfLifeStatus(device: Record<string, unknown>) {
    if (this.loggedUnexpectedEndOfLifeStatus || device.end_of_life_status === undefined || device.end_of_life_status === 1) {
      return;
    }
    this.loggedUnexpectedEndOfLifeStatus = true;
    this.platform.log.warn('Kidde device returned unexpected end_of_life_status for',
      this.accessory.displayName, device.end_of_life_status);
  }
  
  async handleCarbonMonoxideDetectedGet(): Promise<CharacteristicValue> {
    return this.convertCarbonMonoxideDetected(this.client.devices![this.device_id].co_alarm as boolean);
  }
  private convertCarbonMonoxideDetected(co_alarm: boolean) {
    if (co_alarm) {
      return this.platform.Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL;
    }
    return this.platform.Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL;
  }

  async handleHumidityGet(): Promise<CharacteristicValue> {
    return (this.client.devices![this.device_id].humidity as {value: number}).value;
  }

  async handleSmokeDetectedGet(): Promise<CharacteristicValue> {
    return this.convertSmokeDetected(this.client.devices![this.device_id].smoke_alarm as boolean);
  }

  private convertSmokeDetected(smoke_alarm: boolean) {
    if (smoke_alarm) {
      return this.platform.Characteristic.SmokeDetected.SMOKE_DETECTED;
    }
    return this.platform.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED;
  }

  async handleTemperatureGet(): Promise<CharacteristicValue> {
    const iaq_temperature = this.client.devices![this.device_id].iaq_temperature as {Unit: string, value: number};
    if (iaq_temperature.Unit === 'F') {
      return (iaq_temperature.value - 32) * 5 / 9;
    } else {
      return iaq_temperature.value;
    }
  }

  async handleVocDensityGet(): Promise<CharacteristicValue> {
    return this.convertVoc((this.client.devices![this.device_id].tvoc as {value: number}).value);
  }

  private convertVoc(tvoc: number) : CharacteristicValue {
    return tvoc / 4.57;
  }
}
