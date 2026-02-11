import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "./client/api-client.js";
import { TravelCodeConfig } from "./config.js";
import { registerSearchAirports } from "./tools/search-airports.js";
import { registerGetAirport } from "./tools/get-airport.js";
import { registerSearchAirlines } from "./tools/search-airlines.js";
import { registerSearchFlights } from "./tools/search-flights.js";
import { registerGetFlightResults } from "./tools/get-flight-results.js";
import { registerGetFlightStatus } from "./tools/get-flight-status.js";
import { registerGetAirportFlights } from "./tools/get-airport-flights.js";
import { registerGetFlightDelayStats } from "./tools/get-flight-delay-stats.js";
import { registerGetAirportDelayStats } from "./tools/get-airport-delay-stats.js";

export function createServer(config: TravelCodeConfig): McpServer {
  const server = new McpServer({
    name: "TravelCode",
    version: "1.0.0",
  });

  const client = new TravelCodeApiClient(config);

  // Reference data tools
  registerSearchAirports(server, client);
  registerGetAirport(server, client);
  registerSearchAirlines(server, client);

  // Flight search tools
  registerSearchFlights(server, client, config);
  registerGetFlightResults(server, client);

  // Flight statistics tools (AeroDataBox)
  registerGetFlightStatus(server, client);
  registerGetAirportFlights(server, client);
  registerGetFlightDelayStats(server, client);
  registerGetAirportDelayStats(server, client);

  return server;
}
