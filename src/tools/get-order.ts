import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "../client/api-client.js";
import { OrderFull } from "../client/types.js";
import { formatOrderDetail } from "../formatters/order-formatter.js";

export const getOrderSchema = {
  order_id: z.number().int().describe("Order ID"),
};

export function registerGetOrder(server: McpServer, client: TravelCodeApiClient) {
  server.tool(
    "get_order",
    "Get full details of an order including passengers, services, tickets, and payment status.",
    getOrderSchema,
    async ({ order_id }) => {
      try {
        const order = await client.get<OrderFull>(`/orders/${order_id}`);

        return {
          content: [{ type: "text", text: formatOrderDetail(order) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error getting order ${order_id}: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
