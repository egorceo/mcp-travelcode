import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "../client/api-client.js";
import { OrderFull } from "../client/types.js";
import { formatOrderDetail } from "../formatters/order-formatter.js";

const passengerDocumentSchema = z.object({
  type: z.enum(["PASSPORT", "ID_CARD"]).default("PASSPORT").describe("Document type"),
  number: z.string().describe("Document number"),
  expiryDate: z.string().optional().describe("Expiry date (DD.MM.YYYY)"),
  nationality: z.string().optional().describe("Country code ISO 2 (e.g. BY, RU, PL)"),
});

const passengerContactsSchema = z.object({
  email: z.string().optional().describe("Email address"),
  phone: z.string().optional().describe("Phone number with country code (e.g. +375291234567)"),
});

const passengerSchema = z.object({
  type: z.enum(["adult", "child", "infant"]).optional().describe("Passenger type. If omitted, calculated from date of birth"),
  firstName: z.string().describe("First name (Latin characters)"),
  lastName: z.string().describe("Last name (Latin characters)"),
  dateOfBirth: z.string().describe("Date of birth (DD.MM.YYYY)"),
  gender: z.enum(["M", "F"]).describe("Gender"),
  document: passengerDocumentSchema.optional().describe("Travel document details"),
  contacts: passengerContactsSchema.optional().describe("Contact information (recommended for first passenger)"),
});

export const createOrderSchema = {
  cache_id: z.string().describe("Cache ID from a previous search_flights result"),
  offer_id: z.union([z.number(), z.string()]).describe("Offer index from the search results items array, or a specific orderId"),
  passengers: z.array(passengerSchema).min(1).describe("Array of passenger details"),
  idempotency_key: z.string().optional().describe("UUID for duplicate protection (recommended)"),
};

export function registerCreateOrder(server: McpServer, client: TravelCodeApiClient) {
  server.tool(
    "create_order",
    "Book a flight by creating an order from a search result. Requires a cache_id from search_flights, an offer_id (index in search results), and passenger details. The typical flow: search_flights → pick offer → create_order.",
    createOrderSchema,
    async ({ cache_id, offer_id, passengers, idempotency_key }) => {
      try {
        const extraHeaders: Record<string, string> = {};
        if (idempotency_key) {
          extraHeaders["Idempotency-Key"] = idempotency_key;
        }

        const order = await client.post<OrderFull>(
          "/orders",
          {
            cacheId: cache_id,
            offerId: offer_id,
            passengers,
          },
          extraHeaders
        );

        return {
          content: [{ type: "text", text: formatOrderDetail(order) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error creating order: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
