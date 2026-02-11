export interface TravelCodeConfig {
  apiBaseUrl: string;
  apiToken: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

export function loadConfig(): TravelCodeConfig {
  const apiBaseUrl = process.env.TRAVELCODE_API_BASE_URL;
  const apiToken = process.env.TRAVELCODE_API_TOKEN;

  if (!apiBaseUrl) {
    throw new Error(
      "TRAVELCODE_API_BASE_URL is required. Set it to your TravelCode API URL (e.g. https://api.travel-code.com/v1)"
    );
  }

  if (!apiToken) {
    throw new Error(
      "TRAVELCODE_API_TOKEN is required. Get your token from the TravelCode platform."
    );
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    apiToken,
    pollIntervalMs: parseInt(process.env.TRAVELCODE_POLL_INTERVAL_MS || "2000", 10),
    pollTimeoutMs: parseInt(process.env.TRAVELCODE_POLL_TIMEOUT_MS || "90000", 10),
  };
}
