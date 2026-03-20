import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "../client/api-client.js";
import { ModifyResult } from "../client/types.js";
import { formatModifyResult } from "../formatters/order-formatter.js";

export const modifyOrderSchema = {
  order_id: z.number().int().describe("Order ID to modify"),
  type: z
    .enum(["contact", "passport", "rebook", "baggage"])
    .describe("Type of modification: contact (change email/phone), passport (change document), rebook (change dates), baggage (add baggage)"),
  changes: z.record(z.unknown()).describe(
    "Changes object. Fields depend on type:\n" +
    "- contact: { email, phoneCode, phoneNumber }\n" +
    "- passport: { serviceId, passengerId, documentNumber, documentType, expiryDate, nationality }\n" +
    "- rebook: { serviceId, newDate (DD.MM.YYYY), newDateEnd (DD.MM.YYYY) }\n" +
    "- baggage: { serviceId, services: [{ type: 'baggage', weight, passengerId }] }"
  ),
};

export function registerModifyOrder(server: McpServer, client: TravelCodeApiClient) {
  server.tool(
    "modify_order",
    "Modify an existing order. Modification is asynchronous — use get_order to poll for the result. Call check_order_modification first to see which changes are allowed. Supported types: contact, passport, rebook, baggage.",
    modifyOrderSchema,
    async ({ order_id, type, changes }) => {
      try {
        const data = await client.post<ModifyResult>(`/orders/${order_id}/modify`, {
          type,
          changes,
        });

        return {
          content: [{ type: "text", text: formatModifyResult(data) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error modifying order ${order_id}: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
