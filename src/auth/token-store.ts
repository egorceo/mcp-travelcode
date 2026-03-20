/**
 * Token storage for CLI-obtained OAuth tokens.
 *
 * Tokens are stored in ~/.travelcode/tokens.json.
 * Format:
 * {
 *   "access_token": "...",
 *   "refresh_token": "...",
 *   "expires_at": 1234567890,
 *   "scope": "flights:search airports:read ...",
 *   "client_id": "...",
 *   "issuer": "https://api.travel-code.com"
 * }
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const TOKEN_DIR = join(homedir(), ".travelcode");
const TOKEN_FILE = join(TOKEN_DIR, "tokens.json");
const CLIENT_FILE = join(TOKEN_DIR, "client.json");

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix timestamp (seconds)
  scope: string;
  client_id: string;
  issuer: string;
}

export interface StoredClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  issuer: string;
}

async function ensureDir(): Promise<void> {
  await mkdir(TOKEN_DIR, { recursive: true });
}

// --- Tokens ---

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const data = await readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(data) as StoredTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await ensureDir();
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

export async function clearTokens(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(TOKEN_FILE);
  } catch {
    // ignore if file doesn't exist
  }
}

/**
 * Returns a valid access token, refreshing if expired.
 * Returns null if no tokens stored or refresh fails.
 */
export async function getValidToken(issuer: string): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;
  if (tokens.issuer !== issuer) return null;

  const now = Math.floor(Date.now() / 1000);

  // Token still valid (with 60s buffer)
  if (tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  // Try to refresh
  if (!tokens.refresh_token || !tokens.client_id) return null;

  try {
    const response = await fetch(`${issuer}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: tokens.client_id,
      }),
    });

    if (!response.ok) {
      console.error("Token refresh failed, please re-authenticate: npx mcp-travelcode auth");
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    const refreshedTokens: StoredTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: now + data.expires_in,
      scope: data.scope,
      client_id: tokens.client_id,
      issuer: tokens.issuer,
    };

    await saveTokens(refreshedTokens);
    return refreshedTokens.access_token;
  } catch (error) {
    console.error("Token refresh error:", (error as Error).message);
    return null;
  }
}

// --- Client registration ---

export async function loadClient(issuer: string): Promise<StoredClient | null> {
  try {
    const data = await readFile(CLIENT_FILE, "utf-8");
    const client = JSON.parse(data) as StoredClient;
    if (client.issuer !== issuer) return null;
    return client;
  } catch {
    return null;
  }
}

export async function saveClient(client: StoredClient): Promise<void> {
  await ensureDir();
  await writeFile(CLIENT_FILE, JSON.stringify(client, null, 2), "utf-8");
}
