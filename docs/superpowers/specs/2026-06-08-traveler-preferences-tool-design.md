# `get_traveler_preferences` MCP tool — Design

Date: 2026-06-08
Status: Approved design, ready for implementation plan
Related: TravelHub Phase 1 (persisted preferences + `GET /v1/user/preferences`) and
Phase 2 (robert-service reads them). This adds the same data to the MCP server so
any MCP client (Claude.ai, Claude Desktop, robert-service) can use it.

## Background

TravelHub Phase 1 added persisted traveler **preferences** stored at
`user.params['preferences']`, exposed via `GET /v1/user/preferences`
(flight: seat/meal/carriers; hotel: room type/smoking; special: dietary/accessibility).
The `mcp-travelcode` server exposes TravelCode capabilities as MCP tools; it should
expose these preferences too, so an AI client can read them and tailor searches,
bookings, and suggestions — including when an admin/arranger acts on behalf of
another user.

This is a **read-only** addition. The single source of truth stays the REST
endpoint; the MCP server does not store anything.

### Relevant existing code (patterns to follow)

- `src/tools/get-current-user.ts` — closest precedent: a read tool that calls
  `client.get<CurrentUser>("/user/me")`, merges `impersonationInputSchema` into its
  schema, and wraps the handler in `withImpersonation`. Our tool is the direct
  analog for `/user/preferences`.
- `src/client/api-client.ts` — `TravelCodeApiClient.get<T>(path, params?)` issues
  `GET ${baseUrl}${path}` with `Authorization: Bearer ${this.token}`. In the
  OAuth/HTTP server the per-user token is set via `setToken` per request, so
  `client.get("/user/preferences")` runs as the end user.
- `src/util/impersonation-tool.ts` — `withImpersonation` strips `actAs` /
  `actAsCompanyId` from args into an AsyncLocalStorage context the api-client reads;
  merge `impersonationInputSchema` into the tool schema to enable it.
- `src/formatters/*.ts` — each domain has a formatter turning API data into LLM-
  readable text (e.g. `client-formatter.ts`).
- `src/server.ts` — tools are registered with `register<Name>(server, client)`
  imports + calls.
- Tests use **vitest** (`npm test` = `vitest run`), unlike the monorepo services.

## Decisions

| Topic | Decision |
|-------|----------|
| Surface | One new read-only tool `get_traveler_preferences`. Not folded into `get_current_user` (distinct responsibility). |
| Data source | `GET /v1/user/preferences` via the existing `client.get` (no new storage). |
| Impersonation | Supported via `impersonationInputSchema` + `withImpersonation` (admin/arranger reads the target user's preferences with `actAs`). |
| Empty preferences | Render `"No travel preferences saved."` (not an error). |
| Failure | Return `{ isError: true }` with an error message, like other tools. |
| Auto-apply in search | **Out of scope** — the tool is read-only; the model applies prefs when calling `search_flights`/`search_hotels`. |
| Tests | vitest unit test for the formatter. |

## Components (4 files)

### 1. `src/client/types.ts` — add `TravelerPreferences`

Mirror the Phase 1 model:
```ts
export interface TravelerPreferences {
  flight: { seat: string | null; meal: string | null; carriers: string[] };
  hotel: { roomType: string | null; smoking: string | null };
  special: { dietary: string; accessibility: string[] };
}
```

### 2. `src/formatters/preferences-formatter.ts` — `formatPreferences(prefs): string`

- Produces a short, human-readable block (one labelled line per non-empty field),
  e.g. `Flight seat: window`, `Meal: kosher`, `Preferred airlines: LH, TK`,
  `Room type: king`, `Smoking: non-smoking`, `Dietary: no nuts`,
  `Accessibility: wheelchair, hearing`.
- Humanizes enum keys (`exit_row` → `exit row`, `gluten_free` → `gluten-free`,
  `non_smoking` → `non-smoking`, `service_animal` → `service animal`).
- When every field is empty → returns `"No travel preferences saved."`.

### 3. `src/tools/get-traveler-preferences.ts` — `registerGetTravelerPreferences(server, client)`

- Schema: `{ ...impersonationInputSchema }` (no other inputs).
- Handler wrapped in `withImpersonation`: `const data = await client.get<TravelerPreferences>("/user/preferences"); return { content: [{ type: "text", text: formatPreferences(data) }] };`
- `try/catch` → `{ content: [{ type: "text", text: \`Error getting preferences: ${(e as Error).message}\` }], isError: true }`.
- Description (mirroring `get_current_user` tone): explain it returns the user's saved
  travel preferences; **call before a search/booking** to tailor seat/meal/airline/
  room/smoking choices and to honor accessibility/dietary needs; use the SAME `actAs`
  as the upcoming impersonated search; user-facing language only ("your saved
  preferences"), never quote internal keys/routes.

### 4. `src/server.ts` — register the tool

Add the import and the `registerGetTravelerPreferences(server, client)` call alongside
the other tool registrations (near `registerGetCurrentUser` / `registerGetMainClient`).

## Data flow

```
MCP client calls tool get_traveler_preferences (optionally actAs=<email>)
  withImpersonation -> sets actAs context
  client.get<TravelerPreferences>("/user/preferences")  // Bearer = end-user token
  formatPreferences(data) -> text block
  -> { content: [{ type: "text", text }] }
```

## Error & empty handling

- REST failure (network / non-2xx surfaced by `client.get`) → caught → `{ isError: true }` with a plain message; the client can retry or tell the user.
- All-empty preferences → `"No travel preferences saved."` (normal result, not an error) so the model knows to ask or proceed without assumptions.

## Testing

- **vitest** unit test `tests/preferences-formatter.test.ts`: full object → all labelled
  lines (humanized), all-empty → `"No travel preferences saved."`, partial → only the
  set fields.
- `npm run build` (tsc) clean.
- Optional manual: `npm run inspect` (MCP inspector) → call `get_traveler_preferences`
  with a valid token and confirm the formatted block; with `actAs` confirm it reads the
  target user's preferences.

## Out of scope (future)

- Auto-applying preferences as defaults inside `search_flights` / `search_hotels`.
- Writing/editing preferences from MCP (read-only here).
- Any robert-service change (Phase 2 already covers Robert separately).
