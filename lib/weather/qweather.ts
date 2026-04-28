import type { WeatherSnapshot } from "@/lib/types";

type FetchLike = typeof fetch;

interface QWeatherConfig {
  host: string;
  token?: string;
  apiKey?: string;
  fetchImpl: FetchLike;
}

interface CityLookupResult {
  id: string;
  name: string;
  adm1?: string;
  adm2?: string;
}

function appendApiKey(url: URL, apiKey?: string): URL {
  if (!apiKey) return url;
  if (!url.searchParams.get("key")) {
    url.searchParams.set("key", apiKey);
  }
  return url;
}

function createHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export class QWeatherClient {
  private readonly config: QWeatherConfig;

  constructor(config: Partial<QWeatherConfig> = {}) {
    this.config = {
      host: process.env.QWEATHER_API_HOST ?? "https://devapi.qweather.com",
      token: process.env.QWEATHER_TOKEN,
      apiKey: process.env.QWEATHER_API_KEY,
      fetchImpl: fetch,
      ...config
    };
  }

  isConfigured(): boolean {
    return Boolean(this.config.token || this.config.apiKey);
  }

  async getWeatherByLocationQuery(locationQuery: string): Promise<WeatherSnapshot | null> {
    const trimmed = locationQuery.trim();
    if (!trimmed) return null;
    if (!this.isConfigured()) return null;

    try {
      const city = await this.cityLookup(trimmed);
      if (!city?.id) return null;
      return this.weatherNow(city);
    } catch {
      return null;
    }
  }

  private async cityLookup(location: string): Promise<CityLookupResult | null> {
    const url = appendApiKey(
      new URL(`/geo/v2/city/lookup?location=${encodeURIComponent(location)}&lang=zh&number=1`, this.config.host),
      this.config.apiKey
    );

    const response = await this.config.fetchImpl(url.toString(), {
      method: "GET",
      headers: createHeaders(this.config.token),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`QWeather city lookup failed: ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.code !== "200" || !Array.isArray(payload?.location) || payload.location.length === 0) {
      return null;
    }

    const first = payload.location[0];
    return {
      id: String(first.id ?? ""),
      name: String(first.name ?? location),
      adm1: typeof first.adm1 === "string" ? first.adm1 : undefined,
      adm2: typeof first.adm2 === "string" ? first.adm2 : undefined
    };
  }

  private async weatherNow(city: CityLookupResult): Promise<WeatherSnapshot | null> {
    const url = appendApiKey(
      new URL(`/v7/weather/now?location=${encodeURIComponent(city.id)}&lang=zh&unit=m`, this.config.host),
      this.config.apiKey
    );

    const response = await this.config.fetchImpl(url.toString(), {
      method: "GET",
      headers: createHeaders(this.config.token),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`QWeather weather now failed: ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.code !== "200" || !payload?.now) {
      return null;
    }

    const now = payload.now;
    const name = [city.name, city.adm2, city.adm1].filter(Boolean).join(" · ");

    return {
      locationId: city.id,
      locationName: name || city.name,
      text: String(now.text ?? "未知"),
      tempC: Number(now.temp ?? NaN),
      humidity: Number(now.humidity ?? NaN),
      windDir: String(now.windDir ?? ""),
      windScale: String(now.windScale ?? ""),
      obsTime: String(now.obsTime ?? "")
    };
  }
}

