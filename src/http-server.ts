#!/usr/bin/env node

/**
 * HTTP entry point for the TravelCode MCP Server.
 *
 * Supports OAuth 2.1 via MCP spec:
 * - Serves Protected Resource Metadata (RFC 9728) at the path-aware well-known
 *   URL (`/.well-known/oauth-protected-resource/mcp`) AND the legacy
 *   non-suffixed path for older clients.
 * - Proxies Authorization Server Metadata (RFC 8414) at
 *   `/.well-known/oauth-authorization-server`. travel-code.com's nginx blocks
 *   `/.well-known/*` on its own origin, so MCP clients cannot discover AS
 *   metadata there directly. We advertise the sidecar itself as the AS in the
 *   Protected Resource Metadata document and serve the AS metadata here with
 *   the real upstream `authorization_endpoint` / `token_endpoint` /
 *   `registration_endpoint` / `revocation_endpoint` values. The browser and
 *   client hit those upstream URLs directly — only discovery is proxied.
 * - Returns 401 with WWW-Authenticate on missing Bearer and on unknown session,
 *   so clients can restart the OAuth flow after a sidecar restart.
 * - Creates per-session McpServer instances using the user's OAuth token.
 *
 * Stdio transport (src/index.ts) remains unchanged for backward compatibility.
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "./server.js";
import { TravelCodeConfig } from "./config.js";

// --- Configuration ---

const PORT = parseInt(process.env.PORT || "3000", 10);
const API_BASE_URL = (process.env.TRAVELCODE_API_BASE_URL || "https://api.travel-code.com/v1").replace(/\/+$/, "");

// Upstream Authorization Server origin — where the real OAuth endpoints live.
// travel-code.com implements /oauth/authorize, /oauth/token, /oauth/register,
// /oauth/revoke but does NOT expose RFC 8414 metadata (nginx blocks
// /.well-known/*), so we proxy AS metadata from this sidecar.
const UPSTREAM_AS_ORIGIN = (process.env.OAUTH_ISSUER || "https://travel-code.com").replace(/\/+$/, "");

// Resource URI — the public URL of this MCP server (origin, no path).
// In production, set to the actual public URL (e.g. https://mcp.travel-code.com).
// Locally defaults to http://localhost:PORT.
const RESOURCE_URI = (process.env.RESOURCE_URI || `http://localhost:${PORT}`).replace(/\/+$/, "");

// MCP endpoint path — advertised as the canonical resource identifier in
// Protected Resource Metadata (RFC 9728) so audience binding (RFC 8707) works.
const MCP_PATH = "/mcp";
const MCP_RESOURCE_IDENTIFIER = `${RESOURCE_URI}${MCP_PATH}`;

// Path-aware PRM URL per RFC 9728 §3.1.
const PRM_URL = `${RESOURCE_URI}/.well-known/oauth-protected-resource${MCP_PATH}`;

const POLL_INTERVAL_MS = parseInt(process.env.TRAVELCODE_POLL_INTERVAL_MS || "2000", 10);
const POLL_TIMEOUT_MS = parseInt(process.env.TRAVELCODE_POLL_TIMEOUT_MS || "90000", 10);

const SCOPES_SUPPORTED = [
  "flights:search",
  "flights:status",
  "flights:stats",
  "airports:read",
  "airlines:read",
  "orders:read",
  "orders:write",
];

// --- Session store ---

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
}

const sessions = new Map<string, Session>();

// Cleanup stale sessions every 30 minutes
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      session.transport.close().catch(() => {});
      session.server.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 30 * 60 * 1000);

// --- Express app ---

const app = express();
app.use(express.json());

// CORS — needed for browser-based MCP clients
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  next();
});

app.options(/.*/, (_req, res) => {
  res.sendStatus(204);
});

// --- Protected Resource Metadata (RFC 9728) ---
//
// `resource` MUST match the URL the client is actually using (the MCP endpoint)
// so that audience binding / RFC 8707 resource indicators line up.
//
// `authorization_servers` points to the sidecar itself rather than the upstream
// travel-code.com origin, because the upstream blocks /.well-known/* at the
// edge. The client will discover AS metadata from us at
// `/.well-known/oauth-authorization-server` (served below), which in turn
// advertises the real upstream authorize/token/register/revoke endpoints.

const protectedResourceMetadata = {
  resource: MCP_RESOURCE_IDENTIFIER,
  authorization_servers: [RESOURCE_URI],
  scopes_supported: SCOPES_SUPPORTED,
  bearer_methods_supported: ["header"],
  resource_name: "TravelCode MCP Server",
};

app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
  res.json(protectedResourceMetadata);
});

// Legacy non-path-suffixed PRM for older clients that don't do
// path-aware discovery per RFC 9728 §3.1.
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(protectedResourceMetadata);
});

// --- Authorization Server Metadata (RFC 8414) — proxied ---
//
// travel-code.com's nginx blocks /.well-known/oauth-authorization-server at
// the edge, so we host the document ourselves. `issuer` MUST match the URL at
// which this metadata was fetched (RFC 8414 §3.3) — that's RESOURCE_URI.
// The endpoints point to the real upstream OAuth server; the browser and
// token-endpoint calls go there directly.

const authorizationServerMetadata = {
  issuer: RESOURCE_URI,
  authorization_endpoint: `${UPSTREAM_AS_ORIGIN}/oauth/authorize`,
  token_endpoint: `${UPSTREAM_AS_ORIGIN}/oauth/token`,
  registration_endpoint: `${UPSTREAM_AS_ORIGIN}/oauth/register`,
  revocation_endpoint: `${UPSTREAM_AS_ORIGIN}/oauth/revoke`,
  scopes_supported: SCOPES_SUPPORTED,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["none"],
  code_challenge_methods_supported: ["S256"],
};

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json(authorizationServerMetadata);
});

// Some MCP clients also probe a path-suffixed variant.
app.get("/.well-known/oauth-authorization-server/mcp", (_req, res) => {
  res.json(authorizationServerMetadata);
});

// --- Health check ---

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    transport: "streamable-http",
    sessions: sessions.size,
  });
});

// --- Helper: send 401 ---

function send401(res: express.Response, description = "Bearer token required"): void {
  res.status(401)
    .set("WWW-Authenticate", `Bearer resource_metadata="${PRM_URL}"`)
    .json({ error: "unauthorized", error_description: description });
}

// --- MCP endpoint ---

app.all("/mcp", async (req: express.Request, res: express.Response) => {
  // 1. Extract Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    send401(res);
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    send401(res);
    return;
  }

  // 2. Route to existing session or create new
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      // Return 401 (not 404) so the client restarts the OAuth flow after a
      // sidecar restart or TTL expiry, instead of giving up with a dead
      // session ID.
      send401(res, "Session not found or expired. Please re-authenticate.");
      return;
    }

    await session.transport.handleRequest(req, res, req.body);
    return;
  }

  // 3. New session — only via POST (initialization)
  if (req.method !== "POST") {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Missing Mcp-Session-Id header. Initialize session with POST first." },
    });
    return;
  }

  // Create per-session config with user's OAuth token
  const config: TravelCodeConfig = {
    apiBaseUrl: API_BASE_URL,
    apiToken: token,
    pollIntervalMs: POLL_INTERVAL_MS,
    pollTimeoutMs: POLL_TIMEOUT_MS,
  };

  const server = createServer(config);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) {
      sessions.delete(sid);
    }
  };

  await server.connect(transport);

  // Store session
  const sid = transport.sessionId;
  if (sid) {
    sessions.set(sid, {
      transport,
      server,
      createdAt: Date.now(),
    });
  }

  // Handle the initialization request
  await transport.handleRequest(req, res, req.body);
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`TravelCode MCP Server (HTTP) listening on port ${PORT}`);
  console.log(`MCP endpoint:         ${MCP_RESOURCE_IDENTIFIER}`);
  console.log(`Protected Resource:   ${PRM_URL}`);
  console.log(`AS metadata (proxy):  ${RESOURCE_URI}/.well-known/oauth-authorization-server`);
  console.log(`Upstream OAuth:       ${UPSTREAM_AS_ORIGIN}/oauth/{authorize,token,register,revoke}`);
  console.log(`API base URL:         ${API_BASE_URL}`);
  console.log(`Scopes:               ${SCOPES_SUPPORTED.join(", ")}`);
});
