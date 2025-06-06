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
      //                this.service.setCharacteristic(this.platform.Characteristic.Name, "some name");
      if ((this.client.devices![this.device_id].cap_sensor as Array<string>).includes('IAQ')) {
        this.airQualityService = this.accessory.getService(this.platform.Service.AirQualitySensor) ||
          this.accessory.addService(this.platform.Service.AirQualitySensor);
        this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality)
          .onGet(this.handleAirQualityGet.bind(this));

        this.airQualityService.getCharacteristic(this.platform.Characteristic.VOCDensity)
          .onGet(this.handleVocDensityGet.bind(this));
      }
      this.batteryService = this.accessory.getService(this.platform.Service.Battery) ||
      this.accessory.addService(this.platform.Service.Battery);
      this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
        .onGet(this.handleBatteryGet.bind(this));
      if ((this.client.devices![this.device_id].cap_sensor as Array<string>).includes('CO')) {
        this.coService = this.accessory.getService(this.platform.Service.CarbonMonoxideSensor) ||
          this.accessory.addService(this.platform.Service.CarbonMonoxideSensor);
        this.coService.getCharacteristic(this.platform.Characteristic.CarbonMonoxideDetected)
          .onGet(this.handleCarbonMonoxideDetectedGet.bind(this));
      }

      if ((this.client.devices![this.device_id].cap_sensor as Array<string>).includes('Smoke')) {
        this.smokeService = this.accessory.getService(this.platform.Service.SmokeSensor) ||
          this.accessory.addService(this.platform.Service.SmokeSensor);
        this.smokeService.getCharacteristic(this.platform.Characteristic.SmokeDetected)
          .onGet(this.handleSmokeDetectedGet.bind(this));
      }

      if ((this.client.devices![this.device_id].capabilities as Array<string>).includes('temperature')) {
        this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
          this.accessory.addService(this.platform.Service.TemperatureSensor);
        this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .onGet(this.handleTemperatureGet.bind(this));
      }

      this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor);
      this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .onGet(this.handleHumidityGet.bind(this));
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
        this.convertAirQuality(newData![this.device_id].battery_state as string));
    }
    if (this.coService && oldData &&
        oldData![this.device_id].co_alarm !== newData![this.device_id].co_alarm) {
      this.coService.updateCharacteristic(this.platform.Characteristic.CarbonMonoxideDetected,
        this.convertCarbonMonoxideDetected(newData![this.device_id].co_alarm as boolean));
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
    if (this.temperatureService && oldData && 
        (oldData![this.device_id].iaq_temperature as {value: number}).value !== (newData![this.device_id].iaq_temperature as {value: number}).value) {
      this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature,
        (newData![this.device_id].iaq_temperature as {value: number}).value);
    }
    if (this.airQualityService && oldData && 
        (oldData![this.device_id].tvoc as {value: number}).value !== (newData![this.device_id].tvoc as {value: number}).value) {
      this.airQualityService.updateCharacteristic(this.platform.Characteristic.VOCDensity,
        this.convertVoc((newData![this.device_id].tvoc as {value: number}).value));
    }
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
    return (this.client.devices![this.device_id].iaq_temperature as {value: number}).value;
  }

  async handleVocDensityGet(): Promise<CharacteristicValue> {
    return this.convertVoc((this.client.devices![this.device_id].tvoc as {value: number}).value);
  }

  private convertVoc(tvoc: number) : CharacteristicValue {
    return tvoc / 4.57;
  }
}
