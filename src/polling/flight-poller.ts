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

export type ProgressCallback = (progress: number, total: number, message: string) => Promise<void>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeFlightSearch(
  client: TravelCodeApiClient,
  searchParams: FlightSearchRequest,
  config: TravelCodeConfig,
  onProgress?: ProgressCallback
): Promise<FlightSearchResult> {
  // Step 1: Create the search
  await onProgress?.(0, 100, "Submitting search request...");

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
  let pollAttempt = 0;

  await onProgress?.(10, 100, "Waiting for airline responses...");

  while (true) {
    await sleep(interval);
    pollAttempt++;

    const elapsed = Date.now() - startTime;
    // Progress: 10-90% mapped to elapsed/timeout ratio
    const progressPct = Math.min(10 + Math.round((elapsed / config.pollTimeoutMs) * 80), 90);

    if (elapsed >= config.pollTimeoutMs) {
      await onProgress?.(90, 100, "Timeout — fetching partial results...");

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

    const foundCount = results.total ?? 0;
    await onProgress?.(progressPct, 100, `Polling airlines... ${foundCount} flights found so far (attempt ${pollAttempt})`);

    if (results.completed || results.status === "completed") {
      await onProgress?.(100, 100, `Search complete — ${foundCount} flights found`);
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
