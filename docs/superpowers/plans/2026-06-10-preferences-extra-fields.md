# MCP Preferences — Extra Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the new traveler-preference fields (flight stops/time-of-day, hotel board, default nationality, frequent destinations, default sort) in the `get_traveler_preferences` MCP tool output.

**Architecture:** The tool already fetches `GET /user/preferences` and renders it with `formatPreferences`. Extend the `TravelerPreferences` type (new fields optional/nullable), add guarded labelled lines to the formatter with explicit code→text maps, extend the formatter tests, and mention the new fields in the tool description. Fetch/impersonation logic is unchanged.

**Tech Stack:** TypeScript, MCP SDK, vitest. Build: `npm run build` (tsc). Test: `npm test` (vitest run). ESM/NodeNext — local imports use `.js` extensions.

---

### Task 1: Extend the `TravelerPreferences` type

**Files:**
- Modify: `src/client/types.ts` (the `TravelerPreferences` interface, ~line 1078)

- [ ] **Step 1: Add destination element interfaces + new fields**

Replace the existing `TravelerPreferences` interface with:

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

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: exit 0 (the existing test objects omit the new optional fields, so they still compile).

- [ ] **Step 3: Commit**

```bash
git add src/client/types.ts
git commit -m "feat(preferences): add new preference fields to TravelerPreferences type"
```

---

### Task 2: Extend the formatter (TDD)

**Files:**
- Modify: `tests/tools/preferences-formatter.test.ts`
- Modify: `src/formatters/preferences-formatter.ts`

- [ ] **Step 1: Write the failing tests**

Append these two tests inside the existing `describe("formatPreferences", ...)` block in `tests/tools/preferences-formatter.test.ts`:

```ts
  it("formats the new flight/hotel/search/destination/sort fields", () => {
    const prefs: TravelerPreferences = {
      flight: { seat: "window", meal: "regular", carriers: ["FZ"], stops: "nonstop", timeOfDay: "morning" },
      hotel: { roomType: "king", smoking: "non_smoking", board: "AI" },
      special: { dietary: "", accessibility: [] },
      searchDefaults: { nationality: "BY" },
      destinations: {
        flights: [
          { code: "MSQ", title: "Минск", titleEn: "Minsk", countryTitle: "Беларусь", countryTitleEn: "Belarus" },
          { code: "MOW", title: "Москва", titleEn: "Moscow", countryTitle: "Россия", countryTitleEn: "Russia" },
        ],
        hotels: [
          { id: "608817", partner: "", name: "Минск", nameEn: "Minsk", address: "", addressEn: "", countryCode: "BY" },
        ],
      },
      sort: { flight: "price", hotel: "popular" },
    };
    const out = formatPreferences(prefs);
    expect(out).toContain("Flight stops: nonstop only");
    expect(out).toContain("Preferred departure time: morning (05:00–09:00)");
    expect(out).toContain("Hotel meal plan: All inclusive");
    expect(out).toContain("Default nationality: BY");
    expect(out).toContain("Frequent flight destinations: Minsk (MSQ), Moscow (MOW)");
    expect(out).toContain("Frequent hotel destinations: Minsk");
    expect(out).toContain("Default flight sort: cheapest");
    expect(out).toContain("Default hotel sort: most popular");
  });

  it("emits only the present new fields and does not throw on missing ones", () => {
    const partial: TravelerPreferences = {
      flight: { seat: null, meal: null, carriers: [], stops: "max_1" },
      hotel: { roomType: null, smoking: null },
      special: { dietary: "", accessibility: [] },
    };
    expect(formatPreferences(partial)).toBe("Flight stops: max 1 stop");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the two new tests FAIL (the formatter doesn't emit the new lines yet); existing tests pass.

- [ ] **Step 3: Implement the formatter changes**

In `src/formatters/preferences-formatter.ts`, add these maps after the `humanize()` function (before `formatPreferences`):

```ts
const STOPS: Record<string, string> = {
  nonstop: "nonstop only",
  max_1: "max 1 stop",
  max_2: "max 2 stops",
};
const TIME_OF_DAY: Record<string, string> = {
  morning: "morning (05:00–09:00)",
  midday: "midday (11:00–16:00)",
  evening: "evening (17:00–22:00)",
};
const BOARDS: Record<string, string> = {
  RO: "Room only",
  BI: "Breakfast included",
  HB: "Half board",
  FB: "Full board",
  AI: "All inclusive",
};
const FLIGHT_SORT: Record<string, string> = { price: "cheapest", fast: "fastest" };
const HOTEL_SORT: Record<string, string> = { popular: "most popular", price: "cheapest" };
```

Then replace the body of `formatPreferences` with (keeps existing lines, adds the new guarded ones in logical order):

```ts
export function formatPreferences(prefs: TravelerPreferences): string {
  const lines: string[] = [];
  const { flight, hotel, special } = prefs;

  if (flight.seat) lines.push(`Flight seat: ${humanize(flight.seat)}`);
  if (flight.meal) lines.push(`Meal: ${humanize(flight.meal)}`);
  if (flight.carriers.length) lines.push(`Preferred airlines: ${flight.carriers.join(", ")}`);
  if (flight.stops) lines.push(`Flight stops: ${STOPS[flight.stops] ?? humanize(flight.stops)}`);
  if (flight.timeOfDay) lines.push(`Preferred departure time: ${TIME_OF_DAY[flight.timeOfDay] ?? humanize(flight.timeOfDay)}`);

  if (hotel.roomType) lines.push(`Room type: ${humanize(hotel.roomType)}`);
  if (hotel.smoking) lines.push(`Smoking: ${humanize(hotel.smoking)}`);
  if (hotel.board) lines.push(`Hotel meal plan: ${BOARDS[hotel.board] ?? humanize(hotel.board)}`);

  if (special.dietary.trim()) lines.push(`Dietary: ${special.dietary.trim()}`);
  if (special.accessibility.length) {
    lines.push(`Accessibility: ${special.accessibility.map(humanize).join(", ")}`);
  }

  const nationality = prefs.searchDefaults?.nationality;
  if (nationality) lines.push(`Default nationality: ${nationality}`);

  const flightDests = prefs.destinations?.flights ?? [];
  if (flightDests.length) {
    lines.push(`Frequent flight destinations: ${flightDests.map((d) => `${d.titleEn || d.title} (${d.code})`).join(", ")}`);
  }
  const hotelDests = prefs.destinations?.hotels ?? [];
  if (hotelDests.length) {
    lines.push(`Frequent hotel destinations: ${hotelDests.map((d) => d.nameEn || d.name).join(", ")}`);
  }

  const flightSort = prefs.sort?.flight;
  if (flightSort) lines.push(`Default flight sort: ${FLIGHT_SORT[flightSort] ?? humanize(flightSort)}`);
  const hotelSort = prefs.sort?.hotel;
  if (hotelSort) lines.push(`Default hotel sort: ${HOTEL_SORT[hotelSort] ?? humanize(hotelSort)}`);

  return lines.length === 0 ? "No travel preferences saved." : lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (existing + the two new ones).

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/tools/preferences-formatter.test.ts src/formatters/preferences-formatter.ts
git commit -m "feat(preferences): render new preference fields in formatter"
```

---

### Task 3: Update the tool description

**Files:**
- Modify: `src/tools/get-traveler-preferences.ts`

- [ ] **Step 1: Extend the first description line**

Replace the first line of the description array:

```ts
      "Return the user's saved travel preferences — flight (seat, meal, preferred airlines), hotel (room type, smoking), and special needs (dietary, accessibility).",
```

with:

```ts
      "Return the user's saved travel preferences — flight (seat, meal, preferred airlines, stops, departure time), hotel (room type, smoking, meal plan), special needs (dietary, accessibility), default nationality, frequent destinations, and default flight/hotel sort.",
```

Also update the "When to call" line to mention biasing by the new fields. Replace:

```ts
      "When to call: before a flight/hotel search or booking, to tailor options — bias search_flights / search_hotels toward the preferred seat, meal, airline, room type and smoking choice, and always honor dietary and accessibility needs. Call once and reuse for the session.",
```

with:

```ts
      "When to call: before a flight/hotel search or booking, to tailor options — bias search_flights / search_hotels toward the preferred seat, meal, airline, stops, departure time, room type, meal plan and smoking choice, prefill nationality, lean on frequent destinations and the default sort, and always honor dietary and accessibility needs. Call once and reuse for the session.",
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/tools/get-traveler-preferences.ts
git commit -m "docs(preferences): mention new fields in get_traveler_preferences description"
```

---

## Self-review notes
- Spec coverage: type (Task 1), formatter + maps + guards (Task 2), tests (Task 2), tool description (Task 3) — all spec sections covered.
- New fields are optional in the type and guarded with `?.`/`.length`/truthiness in the formatter — missing fields are skipped, never thrown on (spec error-handling).
- Unknown enum codes fall back to `humanize()` (spec).
- The en-dash `–` in the time-of-day strings is identical in the formatter and the test.
- Do not change fetch/impersonation or the input schema (out of scope).
