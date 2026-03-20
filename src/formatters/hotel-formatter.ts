import {
  HotelLocationSearchResponse,
  HotelOffer,
} from "../client/types.js";

export function formatHotelLocations(data: HotelLocationSearchResponse): string {
  if (!data.items || data.items.length === 0) {
    return "No locations found.";
  }

  const lines: string[] = [`Found ${data.items.length} group(s):\n`];

  for (const group of data.items) {
    lines.push(`--- ${group.type.toUpperCase()}: ${group.text} ---`);
    for (const child of group.children) {
      const idHint = group.type === "hotels" ? `(use location: ${child.id})` : `(use location: ${child.id})`;
      const addr = child.address ? ` — ${child.address}` : "";
      lines.push(`  ID: ${child.id} ${idHint}  ${child.name}${addr}  [${child.countryCode}]`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const BOARD_NAMES: Record<string, string> = {
  RO: "Room Only",
  BI: "Breakfast Included",
  LI: "Lunch Included",
  DI: "Dinner Included",
  HB: "Half Board",
  FB: "Full Board",
  AI: "All Inclusive",
};

export function formatHotelResults(hotels: HotelOffer[], totalCount: number): string {
  if (hotels.length === 0) {
    return totalCount > 0
      ? `Found ${totalCount} hotels total, but none in the current page. Try adjusting offset/limit or filters.`
      : "No hotels found matching your criteria.";
  }

  const lines: string[] = [`Found ${totalCount} hotels total. Showing ${hotels.length}:\n`];

  for (const hotel of hotels) {
    const starRating = (hotel.starRating as number) ?? (hotel.stars as number);
    const stars = starRating ? "★".repeat(starRating) : "";
    const name = (hotel.propertyName as string) ?? hotel.name ?? "Unknown Hotel";
    const pricePerNight = hotel.price != null ? `$${hotel.price}` : "N/A";
    const totalPrice = (hotel.total as number) != null ? `$${hotel.total}` : "";
    const boardCode = (hotel.boardCode as string) ?? hotel.board ?? "";
    const mealName = (hotel.meal as string) ?? BOARD_NAMES[boardCode] ?? boardCode;
    const refundable = (hotel.refundable as boolean);
    const refundText = refundable === true ? "Refundable" : refundable === false ? "Non-refundable" : "";
    const partner = (hotel.partnerName as string) ?? "";

    lines.push(`${stars} ${name}`);
    lines.push(`  Price: ${pricePerNight}/night${totalPrice ? ` (total: ${totalPrice})` : ""}`);
    if (mealName) lines.push(`  Meal: ${mealName}`);
    const tags = [refundText, partner].filter(Boolean).join(" | ");
    if (tags) lines.push(`  ${tags}`);
    lines.push("");
  }

  return lines.join("\n");
}
