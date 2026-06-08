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
