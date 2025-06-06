import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const API_PREFIX = 'https://api.homesafe.kidde.com/api/v4';

// Enum for device commands
enum KiddeCommand {
  IDENTIFY = 'IDENTIFY',
  IDENTIFYCANCEL = 'IDENTIFYCANCEL',
  TEST = 'TEST',
  HUSH = 'HUSH',
}

// Error class for authentication errors
class KiddeClientAuthError extends Error {
  constructor() {
    super('Authentication error');
    this.name = 'KiddeClientAuthError';
  }
}

// Utility function to map list to dictionary by ID
function dictByIds(items: Array<Record<string, unknown>>): Record<number, Record<string, unknown>> {
  const result: Record<number, Record<string, unknown>> = {};
  const ids = new Set<number>();

  items.forEach(item => {
    if (typeof item.id === 'number' && ids.has(item.id as number)) {
      throw new Error(`Duplicate ID found: ${item.id}`);
    }
    ids.add(item.id as number);
    result[item.id as number] = item;
  });

  return result;
}

// Dataset interface
interface KiddeDataset {
  locations: Record<number, Record<string, unknown>>;
  devices?: Record<number, Record<string, unknown>>;
  events?: Record<number, Record<string, unknown>>;
}

// KiddeClient class
class KiddeClient {
  public cookies: Record<string, string>;
  public devices: Record<number, Record<string, unknown>> | undefined;
  public events: Record<number, Record<string, unknown>> | undefined;
  public locations: Record<number, Record<string, unknown>> | undefined;
  static timer: ReturnType<typeof setInterval>;
  private callback?: (oldData: Record<number, Record<string, unknown>> | undefined, newData: Record<number, Record<string, unknown>>) => void;
  constructor(cookies: Record<string, string>) {
    this.cookies = cookies;
    clearInterval(KiddeClient.timer);
    KiddeClient.timer = setInterval( () => {
      this.getData();
    }, 5000);
  }

  // Static method to create a client from login
  static async fromLogin(email: string, password: string): Promise<KiddeClient> {
    const url = `${API_PREFIX}/auth/login`;
    const payload = { email, password };

    try {
      const response = await axios.post(url, payload);
      const cookies = response.headers['set-cookie']?.reduce((acc: Record<string, string>, cookie: string) => {
        const [key, value] = cookie.split(';')[0].split('=');
        acc[key] = value;
        return acc;
      }, {}) || {};
      return new KiddeClient(cookies);
    } catch (error: unknown) {
      if ((error as AxiosError).response?.status === 403) {
        throw new KiddeClientAuthError();
      }
      throw error;
    }
  }

  // Make a request to the API
  private async request(path: string, method: 'GET' | 'POST' = 'GET'): Promise<unknown> {
    const url = `${API_PREFIX}/${path}`;
    const config: AxiosRequestConfig = {
      method,
      url,
      headers: {
        Cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      },
    };

    try {
      const response = await axios(config);
      return response.status === 204 ? null : response.data;
    } catch (error: unknown) {
      if ((error as AxiosError).response?.status === 403) {
        throw new KiddeClientAuthError();
      }
      throw error;
    }
  }

  registerCallback(cb: (oldData: Record<number, Record<string, unknown>> | undefined, newData: Record<number, Record<string, unknown>>) => void): void {
    this.callback = cb;
  }

  // Fetch the dataset
  async getData(getDevices: boolean = true, getEvents: boolean = true): Promise<KiddeDataset> {
    const locationList = await this.request('location');
    this.locations = dictByIds(locationList as Array<Record<string, unknown>>);

    if (getDevices) {
      const devicesList: Record<string, unknown>[] = [];
      for (const locationId of Object.keys(this.locations)) {
        const locationDevices = await this.request(`location/${locationId}/device`);
        devicesList.push(...(locationDevices as Array<Record<string, unknown>>));
      }
      if (this.callback) {
        this.callback(this.devices, dictByIds(devicesList));
      }
      this.devices = dictByIds(devicesList);
    }

    if (getEvents) {
      const eventsList: Record<string, unknown>[] = [];
      for (const locationId of Object.keys(this.locations)) {
        const locationEvents = await this.request(`location/${locationId}/event`);
        eventsList.push(...(locationEvents as {events: unknown}).events as Array<Record<string, unknown>>);
      }
      this.events = dictByIds(eventsList);
    }

    return { locations: this.locations, devices: this.devices, events: this.events };
  }

  // Send a command to a device
  async deviceCommand(locationId: number, deviceId: number, command: KiddeCommand): Promise<void> {
    await this.request(`location/${locationId}/device/${deviceId}/${command}`, 'POST');
  }
}

export { KiddeClient, KiddeCommand, KiddeClientAuthError };
