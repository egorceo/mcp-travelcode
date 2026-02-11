import { TravelCodeConfig } from "../config.js";
import { ApiErrorResponse } from "./types.js";

export class TravelCodeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TravelCodeAuthError";
  }
}

export class TravelCodeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TravelCodeNotFoundError";
  }
}

export class TravelCodeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TravelCodeValidationError";
  }
}

export class TravelCodeServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TravelCodeServerError";
  }
}

export class TravelCodeApiClient {
  private baseUrl: string;
  private token: string;

  constructor(config: TravelCodeConfig) {
    this.baseUrl = config.apiBaseUrl;
    this.token = config.apiToken;
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers(),
    });

    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return this.handleResponse<T>(response);
  }

  async getAerodatabox<T>(
    aerodataboxPath: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    // Build the AeroDataBox path with query params
    const pathUrl = new URL(`https://placeholder${aerodataboxPath}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          pathUrl.searchParams.set(key, String(value));
        }
      }
    }
    const fullAeroPath = pathUrl.pathname + pathUrl.search;

    // Proxy URL: strip /v1 from base URL, route through /flight/aerodatabox
    const proxyBaseUrl = this.baseUrl.replace(/\/v1\/?$/, "");
    const proxyUrl = new URL(`${proxyBaseUrl}/flight/aerodatabox`);
    proxyUrl.searchParams.set("path", fullAeroPath);

    const response = await fetch(proxyUrl.toString(), {
      method: "GET",
      headers: this.headers(),
    });

    return this.handleResponse<T>(response);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "X-Source": "mcp-server",
      Accept: "application/json",
    };
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      return (await response.json()) as T;
    }

    let errorMessage: string;
    try {
      const errorBody = (await response.json()) as ApiErrorResponse;
      errorMessage = errorBody.message || `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }

    switch (response.status) {
      case 400:
      case 422:
        throw new TravelCodeValidationError(errorMessage);
      case 401:
        throw new TravelCodeAuthError(errorMessage);
      case 404:
        throw new TravelCodeNotFoundError(errorMessage);
      default:
        if (response.status >= 500) {
          throw new TravelCodeServerError(errorMessage);
        }
        throw new Error(`API error: ${errorMessage}`);
    }
  }
}
