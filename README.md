# MCP TravelCode

MCP server for the [TravelCode](https://travel-code.com) corporate travel API. Enables AI assistants (Claude Desktop, Cursor, Claude Code) to search flights & hotels, manage bookings, and track flight status.

## Quick Start

```bash
# 1. Authenticate (opens browser, one-time)
npx mcp-travelcode-auth auth

# 2. Add to Claude Desktop (claude_desktop_config.json):
```

```json
{
  "mcpServers": {
    "travelcode": {
      "command": "npx",
      "args": ["mcp-travelcode"]
    }
  }
}
```

```bash
# 3. Restart Claude Desktop — done!
```

### Claude Code

```bash
claude mcp add travelcode -- npx mcp-travelcode
```

## Tools (19)

### Flight Search & Reference Data

| Tool | Description |
|------|-------------|
| `search_airports` | Find airports by name, city, or IATA code |
| `get_airport` | Get details for a specific airport |
| `search_airlines` | Find airlines by name or IATA code |
| `search_flights` | Search for flights (handles async polling automatically) |
| `get_flight_results` | Filter/sort/paginate existing search results |

### Flight Statistics (AeroDataBox)

| Tool | Description |
|------|-------------|
| `get_flight_status` | Real-time flight status (delays, gates, terminals, aircraft) |
| `get_airport_flights` | Airport departure/arrival board for a time window |
| `get_flight_delay_stats` | Historical delay statistics for a flight number |
| `get_airport_delay_stats` | Airport delay and cancellation stats for a date |

### Hotel Search

| Tool | Description |
|------|-------------|
| `search_hotel_locations` | Find cities, regions, or hotels by name (returns location IDs) |
| `get_hotel_location` | Get location details by ID |
| `search_hotels` | Search hotels with filters (stars, price, meal plan, refundability) via SSE stream |

### Order Management

| Tool | Description |
|------|-------------|
| `list_orders` | List orders with filtering and pagination |
| `get_order` | Get full order details |
| `create_order` | Book a flight from search results |
| `check_order_cancellation` | Check cancellation conditions and refund estimate |
| `cancel_order` | Cancel an order |
| `check_order_modification` | Check what modifications are allowed |
| `modify_order` | Modify an order (contacts, passport, rebook, baggage) |

## Authentication

MCP TravelCode uses OAuth 2.1 with PKCE. No API keys to manage — just sign in with your TravelCode account.

```bash
# Sign in (opens browser)
npx mcp-travelcode-auth auth

# Check token status
npx mcp-travelcode-auth status

# Sign out
npx mcp-travelcode-auth logout
```

Tokens are stored in `~/.travelcode/tokens.json` and auto-refresh when expired.

**Legacy mode:** You can also set `TRAVELCODE_API_TOKEN` environment variable to use a static API token.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRAVELCODE_API_TOKEN` | No | — | Static API token (skips OAuth) |
| `TRAVELCODE_API_BASE_URL` | No | `https://api.travel-code.com/v1` | API base URL |
| `TRAVELCODE_POLL_INTERVAL_MS` | No | 2000 | Flight search polling interval (ms) |
| `TRAVELCODE_POLL_TIMEOUT_MS` | No | 90000 | Flight search timeout (ms) |

## Example Conversations

> "Find hotels in Dubai for April 15-18, 2 adults, 4-5 stars, all inclusive"

Uses `search_hotel_locations` → `search_hotels` with star rating and meal plan filters.

> "Search flights from London to Barcelona on March 15, economy, 2 adults"

Uses `search_airports` → `search_flights` → returns formatted flight options.

> "Show my orders" / "Cancel order 12345"

Uses `list_orders`, `check_order_cancellation` → `cancel_order`.

> "Is flight LO776 on time today?"

Uses `get_flight_status` to check real-time status.

## Development

```bash
npm run dev         # Run with tsx (hot reload)
npm run build       # Compile TypeScript
npm run inspect     # Test with MCP Inspector
npm run start:http  # Run HTTP transport (OAuth for browser clients)
```

## License

MIT
