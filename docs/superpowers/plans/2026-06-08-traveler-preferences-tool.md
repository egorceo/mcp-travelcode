# `get_traveler_preferences` MCP Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `get_traveler_preferences` MCP tool that returns the user's persisted travel preferences (`GET /v1/user/preferences`), with impersonation support, so any MCP client can tailor searches/bookings.

**Architecture:** A pure `formatPreferences` formatter turns the API object into LLM-readable text. A thin tool (mirroring `get_current_user`) calls `client.get("/user/preferences")` inside `withImpersonation` and returns the formatted text. Registered in `server.ts`. Single source of truth stays the REST endpoint — no storage here.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, the repo's `TravelCodeApiClient`, vitest.

---

## Notes (read first)
- **ESM imports use a `.js` suffix** for local TS modules (e.g. `from "../client/types.js"`). Follow this.
- This repo **has vitest** (`npm test` = `vitest run`). Write a real unit test for the formatter.
- Tool files mirror `src/tools/get-current-user.ts` (read tool + impersonation). Formatters mirror `src/formatters/rate-guard-formatter.ts`.
- Code/comments in English. No stray `console.log`.
- Run commands from the repo root `/Users/mymacbook/Documents/mcp-travelcode`.

## File structure
- Modify `src/client/types.ts` — add `TravelerPreferences` interface.
- Create `src/formatters/preferences-formatter.ts` — pure `formatPreferences`.
- Create `tests/tools/preferences-formatter.test.ts` — vitest unit test.
- Create `src/tools/get-traveler-preferences.ts` — the tool registration.
- Modify `src/server.ts` — import + register the tool.

---

## Task 1: Type + formatter (TDD)

**Files:**
- Modify: `src/client/types.ts`
- Create: `tests/tools/preferences-formatter.test.ts`
- Create: `src/formatters/preferences-formatter.ts`

- [ ] **Step 1: Add the `TravelerPreferences` type**

Append to `src/client/types.ts`:
```ts
/** Persisted traveler preferences (TravelHub Phase 1: GET /v1/user/preferences). */
export interface TravelerPreferences {
  flight: { seat: string | null; meal: string | null; carriers: string[] };
  hotel: { roomType: string | null; smoking: string | null };
  special: { dietary: string; accessibility: string[] };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/tools/preferences-formatter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatPreferences } from "../../src/formatters/preferences-formatter.js";
import type { TravelerPreferences } from "../../src/client/types.js";

const empty: TravelerPreferences = {
  flight: { seat: null, meal: null, carriers: [] },
  hotel: { roomType: null, smoking: null },
  special: { dietary: "", accessibility: [] },
};

describe("formatPreferences", () => {
  it("returns a clear message when nothing is set", () => {
    expect(formatPreferences(empty)).toBe("No travel preferences saved.");
  });

  it("formats and humanizes all fields", () => {
    const full: TravelerPreferences = {
      flight: { seat: "exit_row", meal: "gluten_free", carriers: ["LH", "TK"] },
      hotel: { roomType: "king", smoking: "non_smoking" },
      special: { dietary: "  no nuts ", accessibility: ["wheelchair", "service_animal"] },
    };
    expect(formatPreferences(full)).toBe(
      [
        "Flight seat: exit row",
        "Meal: gluten-free",
        "Preferred airlines: LH, TK",
        "Room type: king",
        "Smoking: non-smoking",
        "Dietary: no nuts",
        "Accessibility: wheelchair, service animal",
      ].join("\n"),
    );
  });

  it("emits only the fields that are set", () => {
    const partial: TravelerPreferences = {
      flight: { seat: "window", meal: null, carriers: [] },
      hotel: { roomType: null, smoking: null },
      special: { dietary: "low sodium", accessibility: [] },
    };
    expect(formatPreferences(partial)).toBe("Flight seat: window\nDietary: low sodium");
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npx vitest run tests/tools/preferences-formatter.test.ts`
Expected: FAIL — cannot import `formatPreferences` (module not created).

- [ ] **Step 4: Implement the formatter**

Create `src/formatters/preferences-formatter.ts`:
```ts
import { TravelerPreferences } from "../client/types.js";

/** Humanize an enum key for display: snake_case -> spaced/hyphenated wording. */
function humanize(value: string): string {
  switch (value) {
    case "gluten_free": return "gluten-free";
    case "lactose_free": return "lactose-free";
    case "non_smoking": return "non-smoking";
    case "exit_row": return "exit row";
    case "service_animal": return "service animal";
    default: return value.replace(/_/g, " ");
  }
}

/**
 * Render saved traveler preferences as an LLM-readable block. Only non-empty
 * fields are emitted; returns a clear message when nothing is set.
 */
export function formatPreferences(prefs: TravelerPreferences): string {
  const lines: string[] = [];
  const { flight, hotel, special } = prefs;

  if (flight.seat) lines.push(`Flight seat: ${humanize(flight.seat)}`);
  if (flight.meal) lines.push(`Meal: ${humanize(flight.meal)}`);
  if (flight.carriers.length) lines.push(`Preferred airlines: ${flight.carriers.join(", ")}`);
  if (hotel.roomType) lines.push(`Room type: ${humanize(hotel.roomType)}`);
  if (hotel.smoking) lines.push(`Smoking: ${humanize(hotel.smoking)}`);
  if (special.dietary.trim()) lines.push(`Dietary: ${special.dietary.trim()}`);
  if (special.accessibility.length) {
    lines.push(`Accessibility: ${special.accessibility.map(humanize).join(", ")}`);
  }

  return lines.length === 0 ? "No travel preferences saved." : lines.join("\n");
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run tests/tools/preferences-formatter.test.ts`
Expected: PASS (3 tests green).

- [ ] **Step 6: Commit**

```bash
git add src/client/types.ts src/formatters/preferences-formatter.ts tests/tools/preferences-formatter.test.ts
git commit -m "feat: add TravelerPreferences type and formatter with tests"
```

---

## Task 2: The tool + registration

**Files:**
- Create: `src/tools/get-traveler-preferences.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Create the tool**

Create `src/tools/get-traveler-preferences.ts` (mirrors `src/tools/get-current-user.ts`):
```ts
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
```

- [ ] **Step 2: Register the tool in `server.ts`**

In `src/server.ts`, add the import next to the existing user/profile tool imports (near `import { registerGetCurrentUser } from "./tools/get-current-user.js";`):
```ts
import { registerGetTravelerPreferences } from "./tools/get-traveler-preferences.js";
```
And add the registration call directly after the `registerGetCurrentUser(server, client);` line:
```ts
  registerGetTravelerPreferences(server, client);
```

- [ ] **Step 3: Build (type-check the whole server)**

Run: `npm run build`
Expected: `tsc` exits 0, emits `build/`.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass (including the new formatter test).

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-traveler-preferences.ts src/server.ts
git commit -m "feat: register get_traveler_preferences MCP tool"
```

---

## Final verification

- [ ] `npm run build` — clean (`tsc` exit 0).
- [ ] `npm test` — all green, including `preferences-formatter.test.ts`.
- [ ] `git grep -n "registerGetTravelerPreferences" src/server.ts` — shows both the import and the call.
- [ ] No stray `console.log` in the new files.
- [ ] Optional manual: `npm run inspect`, call `get_traveler_preferences` with a valid token → formatted block; with `actAs=<email>` → the target user's preferences.

---

## Self-review against the spec

- **Read-only tool reading `/user/preferences`** (spec Components 3) → Task 2 tool. ✅
- **`TravelerPreferences` type** (Components 1) → Task 1 Step 1. ✅
- **`formatPreferences` formatter, humanized, empty→message** (Components 2) → Task 1 Steps 2/4 + test. ✅
- **Impersonation via `impersonationInputSchema` + `withImpersonation`** (Decisions) → Task 2 tool schema + wrapper. ✅
- **Registration in `server.ts`** (Components 4) → Task 2 Step 2. ✅
- **Empty → "No travel preferences saved."; failure → `{ isError: true }`** (Error handling) → formatter + tool catch. ✅
- **vitest unit test** (Testing) → Task 1. ✅
- **Out of scope** (auto-apply in search, write/edit, robert-service) → none touched. ✅
- Placeholder scan: every code step has full code; no TBD/TODO. ✅
- Type/name consistency: `TravelerPreferences`, `formatPreferences`, `registerGetTravelerPreferences`, tool name `get_traveler_preferences`, and `client.get<TravelerPreferences>("/user/preferences")` are identical across Tasks 1–2 and the test. ✅
