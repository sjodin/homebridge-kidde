import { expect, test, beforeEach, afterEach } from '@jest/globals';
import { KiddeClient } from '../src/kiddeclient';
import { writeFileSync } from 'node:fs';
import nock from 'nock';
import { HAPStatus } from 'hap-nodejs';
import { HomebridgeAPI } from 'homebridge/lib/api';
import { Logger } from 'homebridge/lib/logger';
import { KiddeHomebridgePlatform } from '../src/platform';

let platform: KiddeHomebridgePlatform;
let _api;
let logger;

beforeAll(async () => {
  // Mock API response
  nock.disableNetConnect();
  nock('https://api.homesafe.kidde.com')
    .persist()
    .post('/api/v4/auth/login')
    .reply(200, {
      'id': 1234567,
      'name': 'John Doe',
      'notify_email': false,
      'notify_sms': false,
      'notify_push': true,
      'notify_local_geo': 'all',
      'marketing_opt_in': false,
      'remote_logging': false,
      'email': 'john.doe@github.com',
      'has_password': true,
      'language': 'en',
      'alexa_enabled': true,
      'log_enabled': false,
      'pending_alerts': false,
      'google_asst_enabled': true,
      'temperature_unit': 'F',
      'alexa_skill_linked': false,
      'alexa_skill_status': 0,
      'timezone': 'America/Toronto',
      'session_token': '19c91454133cedbe39915d0027745e4d79999007',
      'access_token': '19c91454133cedbe39915d0027745e4d79999007',
      'refresh_token': '19c91454133cedbe39915d0027745e4d79999007',
    }, { 'Set-Cookie': 'session=19c91454133cedbe39915d0027745e4d79999007; Path=/; Max-Age=63072000' });
  nock('https://api.homesafe.kidde.com')
    .persist()
    .get('/api/v4/location')
    .reply(200, [
      {
        'arm_type': 'manual',
        'country': 'Canada',
        'emergency': '123456789',
        'emergency_desc': 'John Doe',
        'geo_size': 1,
        'id': 123456,
        'label': '12 Street St',
        'latitude': 12.3456789,
        'longitude': 12.3456789,
        'smoke_mitigation': false,
        'tvoc_mitigation': false,
        'user_id': 123456,
        'viewers_delay': 0,
        'viewers_enabled': true,
        'zip': '123456',
      },
    ]);
  nock('https://api.homesafe.kidde.com')
    .persist()
    .get('/api/v4/location/123456/device')
    .reply(200, [
      {
        'accuracy': 4.733760541967079,
        'altitude': 62.138088275678456,
        'announcement': 'kitchen',
        'ap_rssi': -50,
        'batt_volt': 0,
        'battery_state': 'ok',
        'cap_sensor': [
          'Smoke',
          'IAQ',
          'CO',
        ],
        'capabilities': [
          'smoke',
          'temperature',
          'co',
        ],
        'co2': {
          'Unit': 'PPM',
          'status': 'Hazardous',
          'value': 2880.24,
        },
        'co_alarm': false,
        'co_level': 1,
        'contact_lost': false,
        'country_code': 'CO',
        'diag_params': {
          'ap_rssi': -50,
        },
        'end_of_life_status': 1,
        'errors': [],
        'fwrev': {
          'alarm': '1.10',
          'net': '4.4.1',
          'wm': '2.5',
        },
        'hpa': {
          'Unit': 'hpa',
          'status': 'Unhealthy',
          'value': 99998,
        },
        'humidity': {
          'Unit': '%RH',
          'status': 'Good',
          'value': 33.56,
        },
        'hwrev': 'WD-ESP32',
        'iaq': {
          'status': 'Bad',
          'value': 204.66,
        },
        'iaq_learn_countdown': 96,
        'iaq_state': 'Learning',
        'iaq_temperature': {
          'Unit': 'F',
          'status': 'Good',
          'value': 70,
        },
        'iaq_test_status': true,
        'id': 779836,
        'identifying': false,
        'instance_id': 'ce3550a039',
        'label': 'Kitchen',
        'last_seen': '2025-03-25T16:01:56.683414469Z',
        'last_test_time': '2025-03-25T16:01:16Z',
        'latitude': 12.3456789,
        'life': 535,
        'locate_active': false,
        'location_id': 123456,
        'longitude': 12.3456789,
        'lost': false,
        'mb_model': 38,
        'model': 'wifiiaqdetector',
        'motion_active': false,
        'notify': true,
        'notify_contact': true,
        'notify_eol': true,
        'notify_iaq_temp': false,
        'notify_mold_risk': false,
        'notify_rh': false,
        'notify_tvoc': false,
        'offline': false,
        'overall_iaq_status': 'Very Bad',
        'ptt_active': false,
        'ptt_state': 'idle',
        'reset_flag': false,
        'serial_number': 'CE3550A039',
        'smoke_alarm': false,
        'smoke_comp': 0,
        'smoke_hushed': false,
        'smoke_level': 0,
        'ssid': 'zxcvb',
        'temperature': 70,
        'temperature_f': 70,
        'too_much_smoke': false,
        'tvoc': {
          'Unit': 'ppb',
          'status': 'Very Bad',
          'value': 2772.55,
        },
        'weather_active': false,
      },
    ]);
  nock('https://api.homesafe.kidde.com')
    .persist()
    .get('/api/v4/location/123456/event')
    .reply(200, {
      'events': [
        {
          'can_delete': true,
          'created_time': '2025-03-21 14:33:15.290970',
          'event_type': 'member_added',
          'id': 188668997,
          'updated_time': '2025-03-21 14:33:15.290970',
          'user_id': 123456,
          'user_name': 'John Doe',
        },
      ],
      'page_size': 100,
      'update_key': 'eyJpZCI6MTIzNDU2Nzg5LCJ0aW1lIjoiMjAyNS0wMy0yMVQxNDozMzoxNS4yOTA5N1oifQ==',
    });
  nock('https://api.homesafe.kidde.com')
    .persist()
    .get('/api/v4/location/123456/member')
    .reply(200, [
      {
        'geo_enabled': true,
        'id': 123456,
        'name': 'John Doe',
        'role': 'owner',
      },
    ]);
  console.warn(nock.activeMocks());
});

beforeEach(async () => {
  logger = Logger.withPrefix('kidde');
  Logger.setDebugEnabled();
  _api = new HomebridgeAPI();
  const platformConfig =
	{
	  'username': 'john.doe@github.com',
	  'password': '123456',
	  'platform': 'kidde',
	  'cookies': {
	    'session': '19c91454133cedbe39915d0027745e4d79999007',
	  },
	};
  const currentConfig = { 'platforms': [platformConfig] };
  writeFileSync(_api.user.configPath(), JSON.stringify(currentConfig, null, 4));
  platform = new KiddeHomebridgePlatform(logger, platformConfig, _api);
  await platform.discoverDevices();
});

afterEach(async () => {
  clearInterval(KiddeClient.timer);
});

test('airQuality get', async () => {
  if (platform.accessories.values().next().value) {
    const airQualitySensor = platform.accessories.values().next().value!.getService(platform.Service.AirQualitySensor);
    const airQuality = airQualitySensor!.getCharacteristic(platform.Characteristic.AirQuality);

    await airQuality.handleGetRequest().then(() => {
      expect(airQuality.statusCode).toEqual(HAPStatus.SUCCESS);
      expect(airQuality.value).toEqual(platform.Characteristic.AirQuality.INFERIOR);
    });
    const vocDensity = airQualitySensor!.getCharacteristic(platform.Characteristic.VOCDensity);
    await vocDensity.handleGetRequest().then(() => {
      expect(vocDensity.statusCode).toEqual(HAPStatus.SUCCESS);
      expect(vocDensity.value).toEqual(Math.round(2772.55 / 4.57));
    });
  } else {
    console.log('No accessories ' + platform.accessories.size);
  }
});

test('coalarm get', async () => {
  if (platform.accessories.values().next().value) {
    const coSensor = platform.accessories.values().next().value!.getService(platform.Service.CarbonMonoxideSensor);
    const coDetected = coSensor!.getCharacteristic(platform.Characteristic.CarbonMonoxideDetected);

    await coDetected.handleGetRequest().then(() => {
      expect(coDetected.statusCode).toEqual(HAPStatus.SUCCESS);
      expect(coDetected.value).toEqual(platform.Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL);
    });
  } else {
    console.log('No accessories ' + platform.accessories.size);
  }
});

test('smoke get', async () => {
  if (platform.accessories.values().next().value) {
    const smokeSensor = platform.accessories.values().next().value!.getService(platform.Service.SmokeSensor);
    const smokeDetected = smokeSensor!.getCharacteristic(platform.Characteristic.SmokeDetected);

    await smokeDetected.handleGetRequest().then(() => {
      expect(smokeDetected.statusCode).toEqual(HAPStatus.SUCCESS);
      expect(smokeDetected.value).toEqual(platform.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);
    });
  } else {
    console.log('No accessories ' + platform.accessories.size);
  }
});

test('temperature get', async () => {
  if (platform.accessories.values().next().value) {
    const temperatureSensor = platform.accessories.values().next().value!.getService(platform.Service.TemperatureSensor);
    const temperature = temperatureSensor!.getCharacteristic(platform.Characteristic.CurrentTemperature);

    await temperature.handleGetRequest().then(() => {
      expect(temperature.statusCode).toEqual(HAPStatus.SUCCESS);
      expect(temperature.value).toEqual(70);
    });
  } else {
    console.log('No accessories ' + platform.accessories.size);
  }
});

test('humidity get', async () => {
  if (platform.accessories.values().next().value) {
    const humiditySensor = platform.accessories.values().next().value!.getService(platform.Service.HumiditySensor);
    const humidity = humiditySensor!.getCharacteristic(platform.Characteristic.CurrentRelativeHumidity);

    await humidity.handleGetRequest().then(() => {
      expect(humidity.statusCode).toEqual(HAPStatus.SUCCESS);
      expect(humidity.value).toEqual(34);
    });
  } else {
    console.log('No accessories ' + platform.accessories.size);
  }
});

test('battery get', async () => {
  if (platform.accessories.values().next().value) {
    const battery = platform.accessories.values().next().value!.getService(platform.Service.Battery);
    const battery_state = battery!.getCharacteristic(platform.Characteristic.StatusLowBattery);

    await battery_state.handleGetRequest().then(() => {
      expect(battery_state.statusCode).toEqual(HAPStatus.SUCCESS);
      expect(battery_state.value).toEqual(platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    });
  } else {
    console.log('No accessories ' + platform.accessories.size);
  }
});
