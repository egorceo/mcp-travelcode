# Traveler preferences — surface the new fields in MCP — Design

Date: 2026-06-10
Status: Approved design, ready for implementation plan
Follows: `get_traveler_preferences` MCP tool (PR #2, merged to `main`).

## Background

The `get_traveler_preferences` tool fetches `GET /user/preferences` and renders it
with `formatPreferences`. Since the tool was built, the TravelHub preferences blob
gained several fields the MCP type and formatter do not yet surface:

- `flight.stops`, `flight.timeOfDay`
- `hotel.board`
- `searchDefaults.nationality`
- `destinations.flights[]`, `destinations.hotels[]`
- `sort.flight`, `sort.hotel`

The API already returns them; only the MCP `TravelerPreferences` type, the formatter,
the tool description, and the formatter tests need updating. Fetch/impersonation logic
is unchanged.

## Decisions

- Add **all** the new fields (search-relevant prefs + frequent destinations + default sort).
- New sub-objects are typed **optional/nullable**, and the formatter guards every new
  field, so a missing field never throws and simply isn't emitted.
- Render enum codes as human-readable text (explicit maps, not raw codes).
- Nationality is rendered as the raw ISO 3166-1 alpha-2 code (the LLM interprets it);
  no country-name lookup.

## Components / changes

### 1. Type — `src/client/types.ts` (`TravelerPreferences`, ~line 1078)

```ts
export interface PreferenceFlightDestination {
  code: string;
  title: string;
  titleEn: string;
  countryTitle: string;
  countryTitleEn: string;
}

export interface PreferenceHotelDestination {
  id: string;
  partner: string;
  name: string;
  nameEn: string;
  address: string;
  addressEn: string;
  countryCode: string;
}

export interface TravelerPreferences {
  flight: { seat: string | null; meal: string | null; carriers: string[]; stops?: string | null; timeOfDay?: string | null };
  hotel: { roomType: string | null; smoking: string | null; board?: string | null };
  special: { dietary: string; accessibility: string[] };
  searchDefaults?: { nationality?: string | null };
  destinations?: { flights?: PreferenceFlightDestination[]; hotels?: PreferenceHotelDestination[] };
  sort?: { flight?: string | null; hotel?: string | null };
}
```

### 2. Formatter — `src/formatters/preferences-formatter.ts`

Add labelled lines (emitted only when present), with explicit code→text maps:

- `flight.stops`: `nonstop → nonstop only`, `max_1 → max 1 stop`, `max_2 → max 2 stops`
  → `Flight stops: <text>`
- `flight.timeOfDay`: `morning → morning (05:00–09:00)`, `midday → midday (11:00–16:00)`,
  `evening → evening (17:00–22:00)` → `Preferred departure time: <text>`
- `hotel.board`: `RO → Room only`, `BI → Breakfast included`, `HB → Half board`,
  `FB → Full board`, `AI → All inclusive` → `Hotel meal plan: <text>`
- `searchDefaults.nationality` (truthy) → `Default nationality: <CODE>`
- `destinations.flights` (length > 0) → `Frequent flight destinations: <titleEn> (<code>), …`
- `destinations.hotels` (length > 0) → `Frequent hotel destinations: <nameEn>, …`
- `sort.flight`: `price → cheapest`, `fast → fastest` → `Default flight sort: <text>`
- `sort.hotel`: `popular → most popular`, `price → cheapest` → `Default hotel sort: <text>`

Unknown enum values fall back to the existing `humanize()` (snake_case → spaced). The
empty case still returns `"No travel preferences saved."`. Ordering: existing flight
lines, new flight lines (stops, time), existing hotel lines, board, special, then
nationality, destinations, sort.

### 3. Tool description — `src/tools/get-traveler-preferences.ts`

Extend the first description line to mention the new fields so the agent biases
`search_flights` / `search_hotels` by them (stops, departure time, meal plan, default
nationality, frequent destinations, default sort). No logic change.

### 4. Tests — `tests/tools/preferences-formatter.test.ts`

Extend the existing vitest suite:
- a fully-populated object asserts each new line renders with the mapped text;
- the all-empty case still returns `"No travel preferences saved."`;
- a partial object (only some new fields, others undefined) does not throw and emits
  only the present lines.

## Error & edge handling
- Every new field is optional in the type and guarded in the formatter (`?.`, length,
  truthiness) — missing fields are skipped, never thrown on.
- Unknown enum codes fall back to `humanize()` rather than being dropped.

## Testing
- `npm test` (vitest) — formatter tests pass.
- `npx tsc --noEmit` (or the repo's build/typecheck script) — type changes compile.

## Out of scope
- ISO-code → country-name conversion for nationality.
- Changes to fetch/impersonation or the input schema.
