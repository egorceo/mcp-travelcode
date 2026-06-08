import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TravelCodeApiClient } from "../client/api-client.js";
import { TravelerPreferences } from "../client/types.js";
import { formatPreferences } from "../formatters/preferences-formatter.js";
import { impersonationInputSchema, withImpersonation } from "../util/impersonation-tool.js";

export const getTravelerPreferencesSchema = {};

export function registerGetTravelerPreferences(server: McpServer, client: TravelCodeApiClient) {
  server.tool(
    "get_traveler_preferences",
    [
      "Return the user's saved travel preferences — flight (seat, meal, preferred airlines), hotel (room type, smoking), and special needs (dietary, accessibility).",
      "",
      "USER-FACING LANGUAGE: speak about 'your saved preferences'. Never quote internal keys, REST routes, or error codes.",
      "",
      "When to call: before a flight/hotel search or booking, to tailor options — bias search_flights / search_hotels toward the preferred seat, meal, airline, room type and smoking choice, and always honor dietary and accessibility needs. Call once and reuse for the session.",
      "",
      "Impersonation: if the upcoming search/booking runs with actAs=<email> (admin acting for another user), call this tool with the SAME actAs (and actAsCompanyId when set) so you read the TARGET user's preferences, not the admin's.",
      "",
      "If nothing is saved, the tool says so — proceed without assumptions and ask the user when a choice matters.",
    ].join("\n"),
    { ...getTravelerPreferencesSchema, ...impersonationInputSchema },
    withImpersonation(async () => {
      try {
        const data = await client.get<TravelerPreferences>("/user/preferences");
        return { content: [{ type: "text", text: formatPreferences(data) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error getting preferences: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }),
  );
}
