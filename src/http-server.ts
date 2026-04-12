#!/usr/bin/env node

/**
 * HTTP entry point for the TravelCode MCP Server.
 *
 * Supports OAuth 2.1 via MCP spec:
 * - Serves Protected Resource Metadata (RFC 9728) at /.well-known/oauth-protected-resource
 * - Returns 401 with WWW-Authenticate header when Bearer token is missing
 * - Creates per-session McpServer instances using the user's OAuth token
 *
 * The Authorization Server is TravelCode's own OAuth server.
 * Tokens are opaque and validated by TravelCode API on each request.
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
const OAUTH_ISSUER = process.env.OAUTH_ISSUER || "https://travel-code.com";

// Resource URI — the public URL of this MCP server.
// In production, set to the actual public URL (e.g. https://mcp.travel-code.com).
// Locally defaults to http://localhost:PORT.
const RESOURCE_URI = process.env.RESOURCE_URI || `http://localhost:${PORT}`;

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

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: RESOURCE_URI,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: SCOPES_SUPPORTED,
    bearer_methods_supported: ["header"],
    resource_name: "TravelCode MCP Server",
  });
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

function send401(res: express.Response): void {
  const metadataUrl = `${RESOURCE_URI}/.well-known/oauth-protected-resource`;
  res.status(401)
    .set("WWW-Authenticate", `Bearer resource_metadata="${metadataUrl}"`)
    .json({ error: "unauthorized", error_description: "Bearer token required" });
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
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session not found. Please start a new session." },
      });
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
  console.log(`MCP endpoint:        ${RESOURCE_URI}/mcp`);
  console.log(`Resource metadata:   ${RESOURCE_URI}/.well-known/oauth-protected-resource`);
  console.log(`OAuth issuer:        ${OAUTH_ISSUER}`);
  console.log(`API base URL:        ${API_BASE_URL}`);
  console.log(`Scopes:              ${SCOPES_SUPPORTED.join(", ")}`);
});
