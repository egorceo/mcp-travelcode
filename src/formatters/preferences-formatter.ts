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
