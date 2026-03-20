#!/usr/bin/env node

/**
 * CLI OAuth flow for obtaining TravelCode API tokens.
 *
 * Usage: npx mcp-travelcode auth
 *
 * Flow:
 * 1. Register client via DCR (if not already registered)
 * 2. Generate PKCE code_verifier + code_challenge
 * 3. Open browser to /oauth/authorize
 * 4. Start local HTTP server to catch redirect callback
 * 5. Exchange code for tokens
 * 6. Save tokens to ~/.travelcode/tokens.json
 */

import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { URL, URLSearchParams } from "node:url";
import {
  loadClient,
  saveClient,
  saveTokens,
  loadTokens,
  clearTokens,
  type StoredClient,
  type StoredTokens,
} from "./token-store.js";

const DEFAULT_ISSUER = "https://travel-code.com";
const CALLBACK_PORT = 19284; // random-ish port unlikely to conflict
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;

const SCOPES = [
  "flights:search",
  "flights:status",
  "flights:stats",
  "airports:read",
  "airlines:read",
  "orders:read",
  "orders:write",
].join(" ");

// --- PKCE ---

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("base64url");
}

// --- DCR ---

async function registerClient(issuer: string): Promise<StoredClient> {
  const existing = await loadClient(issuer);
  if (existing) {
    console.log(`Using existing client: ${existing.client_id}`);
    return existing;
  }

  console.log("Registering OAuth client...");

  const response = await fetch(`${issuer}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "MCP TravelCode CLI",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Client registration failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    client_id: string;
    client_name: string;
    redirect_uris: string[];
  };

  const client: StoredClient = {
    client_id: data.client_id,
    client_name: data.client_name,
    redirect_uris: data.redirect_uris,
    issuer,
  };

  await saveClient(client);
  console.log(`Client registered: ${client.client_id}`);
  return client;
}

// --- Token exchange ---

async function exchangeCodeForTokens(
  issuer: string,
  clientId: string,
  code: string,
  codeVerifier: string
): Promise<StoredTokens> {
  const response = await fetch(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  const now = Math.floor(Date.now() / 1000);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: now + data.expires_in,
    scope: data.scope,
    client_id: clientId,
    issuer,
  };
}

// --- Open browser ---

async function openBrowser(url: string): Promise<void> {
  const { platform } = await import("node:os");
  const { exec } = await import("node:child_process");

  const os = platform();
  let command: string;

  if (os === "darwin") {
    command = `open "${url}"`;
  } else if (os === "win32") {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`\nCould not open browser automatically. Please open this URL manually:\n${url}\n`);
    }
  });
}

// --- Callback server ---

function waitForCallback(expectedState: string): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out (5 minutes). Please try again."));
    }, 5 * 60 * 1000);

    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html><body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h2>Authorization failed</h2>
            <p>${errorDescription || error}</p>
            <p>You can close this window.</p>
          </body></html>
        `);
        clearTimeout(timeout);
        server.close();
        reject(new Error(`Authorization denied: ${errorDescription || error}`));
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <html><body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h2>Invalid callback</h2>
            <p>Missing code or state mismatch.</p>
          </body></html>
        `);
        clearTimeout(timeout);
        server.close();
        reject(new Error("Invalid callback: missing code or state mismatch"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`
        <html><body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h2>Authorization successful!</h2>
          <p>You can close this window and return to the terminal.</p>
        </body></html>
      `);

      clearTimeout(timeout);
      server.close();
      resolve({ code });
    });

    server.listen(CALLBACK_PORT, () => {
      // server ready
    });

    server.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start callback server on port ${CALLBACK_PORT}: ${err.message}`));
    });
  });
}

// --- Main ---

async function authCommand(): Promise<void> {
  const issuer = process.env.OAUTH_ISSUER || DEFAULT_ISSUER;

  console.log("TravelCode OAuth Authorization");
  console.log(`Issuer: ${issuer}`);
  console.log("");

  // 1. Register client (or reuse existing)
  const client = await registerClient(issuer);

  // 2. Generate PKCE
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  // 3. Build authorization URL
  const authUrl = new URL(`${issuer}/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // 4. Start callback server and open browser
  console.log("Opening browser for authorization...");
  const callbackPromise = waitForCallback(state);
  await openBrowser(authUrl.toString());
  console.log("Waiting for authorization...\n");

  // 5. Wait for callback
  const { code } = await callbackPromise;
  console.log("Authorization code received. Exchanging for tokens...");

  // 6. Exchange code for tokens
  const tokens = await exchangeCodeForTokens(issuer, client.client_id, code, codeVerifier);
  await saveTokens(tokens);

  console.log("");
  console.log("Authentication successful!");
  console.log(`  Access token expires: ${new Date(tokens.expires_at * 1000).toLocaleString()}`);
  console.log(`  Scopes: ${tokens.scope}`);
  console.log(`  Tokens saved to: ~/.travelcode/tokens.json`);
  console.log("");
  console.log("You can now use the MCP server. It will automatically use the saved token.");
}

async function statusCommand(): Promise<void> {
  const tokens = await loadTokens();

  if (!tokens) {
    console.log("Not authenticated. Run: npx mcp-travelcode auth");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const expired = tokens.expires_at <= now;
  const expiresIn = tokens.expires_at - now;

  console.log("TravelCode Auth Status");
  console.log(`  Issuer:    ${tokens.issuer}`);
  console.log(`  Client ID: ${tokens.client_id}`);
  console.log(`  Scopes:    ${tokens.scope}`);
  console.log(`  Expires:   ${new Date(tokens.expires_at * 1000).toLocaleString()}`);
  console.log(`  Status:    ${expired ? "EXPIRED" : `valid (${Math.floor(expiresIn / 60)} min left)`}`);
  console.log(`  Has refresh token: ${tokens.refresh_token ? "yes" : "no"}`);
}

async function logoutCommand(): Promise<void> {
  await clearTokens();
  console.log("Tokens cleared. Run 'npx mcp-travelcode auth' to re-authenticate.");
}

// --- Entry point ---

const command = process.argv[2];

switch (command) {
  case "auth":
  case "login":
    authCommand().catch((err) => {
      console.error("Auth error:", err.message);
      process.exit(1);
    });
    break;

  case "status":
    statusCommand().catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
    break;

  case "logout":
    logoutCommand().catch((err) => {
      console.error("Error:", err.message);
      process.exit(1);
    });
    break;

  default:
    console.log("Usage: mcp-travelcode <command>");
    console.log("");
    console.log("Commands:");
    console.log("  auth     Authenticate with TravelCode (opens browser)");
    console.log("  status   Show current auth status");
    console.log("  logout   Clear saved tokens");
    break;
}
