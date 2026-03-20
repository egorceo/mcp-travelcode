import { getValidToken } from "./auth/token-store.js";

export interface TravelCodeConfig {
  apiBaseUrl: string;
  apiToken: string;
  oauthIssuer?: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

const DEFAULT_ISSUER = "https://travel-code.com";

export async function loadConfig(): Promise<TravelCodeConfig> {
  const apiBaseUrl = process.env.TRAVELCODE_API_BASE_URL || "https://api.travel-code.com/v1";

  const issuer = process.env.OAUTH_ISSUER || DEFAULT_ISSUER;

  // 1. Try env variable first (backward compat)
  let apiToken = process.env.TRAVELCODE_API_TOKEN;
  let oauthIssuer: string | undefined;

  // 2. Try saved OAuth tokens
  if (!apiToken) {
    const savedToken = await getValidToken(issuer);

    if (savedToken) {
      apiToken = savedToken;
      oauthIssuer = issuer; // enable auto-refresh in ApiClient
    }
  }

  if (!apiToken) {
    throw new Error(
      "No API token available.\n" +
      "  Option 1: Run 'npx mcp-travelcode auth' to authenticate via OAuth\n" +
      "  Option 2: Set TRAVELCODE_API_TOKEN environment variable"
    );
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    apiToken,
    oauthIssuer,
    pollIntervalMs: parseInt(process.env.TRAVELCODE_POLL_INTERVAL_MS || "2000", 10),
    pollTimeoutMs: parseInt(process.env.TRAVELCODE_POLL_TIMEOUT_MS || "90000", 10),
  };
}
