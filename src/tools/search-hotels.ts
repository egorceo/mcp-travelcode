import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "../client/api-client.js";
import { HotelOffer, HotelSSECompleted, HotelSSEHotelsBatch, HotelSSESortedBatch } from "../client/types.js";
import { formatHotelResults } from "../formatters/hotel-formatter.js";

const guestSchema = z.object({
  adults: z.number().int().min(1).max(4).describe("Number of adults (1-4)"),
  children: z.number().int().min(0).max(3).optional().describe("Number of children (0-3)"),
  childrenAges: z
    .array(z.number().int().min(0).max(17))
    .optional()
    .describe("Array of child ages (0-17), required if children > 0"),
});

const filterSchema = z.object({
  minPrice: z.number().int().optional().describe("Minimum price per night"),
  maxPrice: z.number().int().optional().describe("Maximum price per night"),
  starRating: z.array(z.number().int().min(1).max(5)).optional().describe("Hotel star ratings, e.g. [4, 5]"),
  boards: z
    .array(z.enum(["RO", "BI", "LI", "DI", "HB", "FB", "AI"]))
    .optional()
    .describe("Meal plan codes: RO=Room Only, BI=Breakfast, HB=Half Board, FB=Full Board, AI=All Inclusive"),
  payments: z
    .array(z.enum(["full_refund"]))
    .optional()
    .describe("Payment filters: full_refund = only fully refundable"),
}).optional();

export const searchHotelsSchema = {
  location: z
    .number()
    .int()
    .describe("Location ID from search_hotel_locations. Positive = city/region, negative = single hotel"),
  checkin: z.string().describe("Check-in date (YYYY-MM-DD)"),
  checkout: z.string().describe("Check-out date (YYYY-MM-DD)"),
  country_code: z.string().describe("Guest nationality ISO code (e.g. BY, RU, US)"),
  guests: z.array(guestSchema).min(1).describe("Array of rooms, each with adults count and optional children"),
  sort: z
    .enum(["recommend", "price"])
    .default("recommend")
    .describe("Sort mode: recommend (default) or price"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  limit: z.number().int().min(1).max(50).default(20).describe("Hotels per page"),
  filter: filterSchema,
};

export function registerSearchHotels(server: McpServer, client: TravelCodeApiClient) {
  server.tool(
    "search_hotels",
    "Search hotels by location, dates, and guests. Requires a location ID from search_hotel_locations — chain the calls silently without explaining intermediate steps to the user. Returns hotel offers with prices, star ratings, and meal plans. Supports filtering by stars, price, meal plan, and refundability.",
    searchHotelsSchema,
    async ({ location, checkin, checkout, country_code, guests, sort, offset, limit, filter }) => {
      try {
        const body: Record<string, unknown> = {
          location,
          checkin,
          checkout,
          countryCode: country_code,
          guests,
          sort,
          offset,
          limit,
        };
        if (filter) {
          body.filter = filter;
        }

        const events = await client.postSSE("/search/hotels/stream", body);

        // Collect hotels from SSE events
        const hotels: HotelOffer[] = [];
        let totalCount = 0;

        for (const { event, data } of events) {
          if (event === "hotels") {
            const batch = data as HotelSSEHotelsBatch;
            hotels.push(...batch.hotels);
          } else if (event === "sorted_hotels") {
            const batch = data as HotelSSESortedBatch;
            hotels.push(...batch.hotels);
            totalCount = batch.total;
          } else if (event === "completed") {
            const completed = data as HotelSSECompleted;
            totalCount = completed.count;
            // In price mode, completed contains the hotels
            if (completed.hotels && completed.hotels.length > 0) {
              hotels.length = 0; // clear intermediate results
              hotels.push(...completed.hotels);
            }
          } else if (event === "error") {
            const err = data as { message: string };
            return {
              content: [{ type: "text", text: `Hotel search error: ${err.message}` }],
              isError: true,
            };
          } else if (event === "timeout") {
            return {
              content: [{ type: "text", text: `Hotel search timed out. Try narrowing your search (fewer dates, specific filters).` }],
              isError: true,
            };
          }
        }

        return {
          content: [{ type: "text", text: formatHotelResults(hotels, totalCount) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error searching hotels: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
