# MCP TravelCode

MCP server for the [TravelCode](https://travel-code.com) corporate travel API. Enables AI assistants (Claude Desktop, Cursor, Claude Code) to search flights, track flight status, check delays, look up airports, and find airlines.

## Tools

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

## Setup

### 1. Install

```bash
npm install -g mcp-travelcode
```

Or clone and build locally:

```bash
git clone <repo-url>
cd mcp-travelcode
npm install
npm run build
```

### 2. Get your API token

Log in to the TravelCode platform and generate an API token for your account.

### 3. Configure in Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "travelcode": {
      "command": "node",
      "args": ["/path/to/mcp-travelcode/build/index.js"],
      "env": {
        "TRAVELCODE_API_BASE_URL": "https://api.travel-code.com/v1",
        "TRAVELCODE_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### 4. Configure in Claude Code

```bash
claude mcp add travelcode -- node /path/to/mcp-travelcode/build/index.js
```

Set environment variables `TRAVELCODE_API_BASE_URL` and `TRAVELCODE_API_TOKEN` in your shell.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRAVELCODE_API_BASE_URL` | Yes | — | API base URL |
| `TRAVELCODE_API_TOKEN` | Yes | — | Bearer token from TravelCode platform |
| `TRAVELCODE_POLL_INTERVAL_MS` | No | 2000 | Flight search polling interval (ms) |
| `TRAVELCODE_POLL_TIMEOUT_MS` | No | 90000 | Flight search timeout (ms) |

## Development

```bash
npm run dev       # Run with tsx (hot reload)
npm run build     # Compile TypeScript
npm run inspect   # Test with MCP Inspector
```

## Example Conversation

> "Find airports in London"

Uses `search_airports` to return LHR, LGW, STN, etc.

> "Search flights from LHR to BCN on March 15, economy, 2 adults"

Uses `search_flights` — creates search, polls for results, returns formatted flight options.

> "Show only direct flights from those results"

Uses `get_flight_results` with the cache ID from the previous search.

> "Is flight LO776 on time today?"

Uses `get_flight_status` to check real-time status, delays, gates, terminals.

> "Show departures from WAW in the next 3 hours"

Uses `get_airport_flights` to display the departure board.

> "Is LO776 usually on time?"

Uses `get_flight_delay_stats` to show historical delay patterns.

> "Are there delays at Heathrow today?"

Uses `get_airport_delay_stats` to assess current airport situation.
