import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "../client/api-client.js";
import { CancelResult } from "../client/types.js";
import { formatCancelResult } from "../formatters/order-formatter.js";

export const cancelOrderSchema = {
  order_id: z.number().int().describe("Order ID to cancel"),
  reason: z.string().optional().describe("Reason for cancellation"),
};

export function registerCancelOrder(server: McpServer, client: TravelCodeApiClient) {
  server.tool(
    "cancel_order",
    "Cancel an order. Cancellation is asynchronous — use get_order to poll for final status. It is recommended to call check_order_cancellation first to verify conditions. Idempotent: calling on an already cancelled order returns current status.",
    cancelOrderSchema,
    async ({ order_id, reason }) => {
      try {
        const body = reason ? { reason } : undefined;
        const data = await client.post<CancelResult>(`/orders/${order_id}/cancel`, body);

        return {
          content: [{ type: "text", text: formatCancelResult(data) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error cancelling order ${order_id}: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
