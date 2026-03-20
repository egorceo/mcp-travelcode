import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "../client/api-client.js";
import { ModifyCheckResponse } from "../client/types.js";
import { formatModifyCheck } from "../formatters/order-formatter.js";

export const checkOrderModificationSchema = {
  order_id: z.number().int().describe("Order ID to check modification for"),
};

export function registerCheckOrderModification(server: McpServer, client: TravelCodeApiClient) {
  server.tool(
    "check_order_modification",
    "Check if an order can be modified and what changes are allowed (contact, passport, rebook, baggage). Returns the list of services with their allowed change types. Always call this before modify_order.",
    checkOrderModificationSchema,
    async ({ order_id }) => {
      try {
        const data = await client.get<ModifyCheckResponse>(`/orders/${order_id}/modify/check`);

        return {
          content: [{ type: "text", text: formatModifyCheck(data, order_id) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error checking modification for order ${order_id}: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
