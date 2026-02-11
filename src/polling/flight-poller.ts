import { TravelCodeApiClient } from "../client/api-client.js";
import { TravelCodeConfig } from "../config.js";
import {
  FlightSearchRequest,
  FlightSearchCreateResponse,
  FlightSearchResultsResponse,
} from "../client/types.js";

export interface FlightSearchResult {
  cacheId: string;
  completed: boolean;
  response: FlightSearchResultsResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeFlightSearch(
  client: TravelCodeApiClient,
  searchParams: FlightSearchRequest,
  config: TravelCodeConfig
): Promise<FlightSearchResult> {
  // Step 1: Create the search
  const createResponse = await client.post<FlightSearchCreateResponse>(
    "/search/flights",
    searchParams
  );

  const cacheId = createResponse.cacheId;

  if (!cacheId) {
    throw new Error("No cacheId returned from flight search creation");
  }

  // Step 2: Poll for results
  const startTime = Date.now();
  let interval = config.pollIntervalMs;
  const maxInterval = Math.max(config.pollIntervalMs * 2.5, 5000);

  while (true) {
    await sleep(interval);

    const elapsed = Date.now() - startTime;
    if (elapsed >= config.pollTimeoutMs) {
      // Timeout — try to get whatever partial results are available
      const partialResults = await client.get<FlightSearchResultsResponse>(
        `/search/flights/${encodeURIComponent(cacheId)}`,
        {
          limit: 25,
          offset: 0,
          sort: "price",
          sortOrder: "ASC",
          embedded: "airlines,dictionaries",
        }
      );

      return {
        cacheId,
        completed: false,
        response: partialResults,
      };
    }

    const results = await client.get<FlightSearchResultsResponse>(
      `/search/flights/${encodeURIComponent(cacheId)}`,
      {
        limit: 25,
        offset: 0,
        sort: "price",
        sortOrder: "ASC",
        embedded: "airlines,dictionaries",
      }
    );

    if (results.completed || results.status === "completed") {
      return {
        cacheId,
        completed: true,
        response: results,
      };
    }

    // Exponential backoff
    interval = Math.min(interval * 1.5, maxInterval);
  }
}
