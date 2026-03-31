import {
  HotelLocationSearchResponse,
  HotelOffer,
  HotelOffersResponse,
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

export function formatHotelOffers(data: HotelOffersResponse): string {
  const prop = data.property;
  const stars = prop.starRating ? "★".repeat(prop.starRating) : "";
  const lines: string[] = [
    `${stars} ${prop.name}`,
    prop.address ? `Address: ${prop.address}` : "",
  ].filter(Boolean);

  // Descriptions
  if (prop.description && prop.description.length > 0) {
    for (const desc of prop.description.slice(0, 2)) {
      const text = desc.text.length > 200 ? desc.text.slice(0, 200) + "..." : desc.text;
      lines.push(`${desc.title}: ${text}`);
    }
  }

  const roomGroups = Object.entries(data.offers);
  let totalRates = 0;
  for (const [, group] of roomGroups) {
    totalRates += group.rates.length;
  }

  lines.push("");
  lines.push(`${roomGroups.length} room types, ${totalRates} rates total:`);
  lines.push("");

  for (const [roomName, group] of roomGroups) {
    const cheapest = group.rates.reduce(
      (min, r) => (r.price.nightly < min.price.nightly ? r : min),
      group.rates[0]
    );
    if (!cheapest) continue;

    const refundable = group.rates.some((r) => r.cancelPolicy.refundable);
    const boards = [...new Set(group.rates.map((r) => r.boardName))].join(", ");

    lines.push(`--- ${roomName} (${group.rates.length} offers) ---`);
    lines.push(`  From: ${cheapest.price.nightly} ${cheapest.price.currency}/night (total: ${cheapest.price.total} for ${cheapest.price.nights} night(s))`);
    lines.push(`  Meal options: ${boards}`);
    lines.push(`  ${refundable ? "Refundable options available" : "Non-refundable"}`);

    // Show top 3 rates
    const sorted = [...group.rates].sort((a, b) => a.price.nightly - b.price.nightly);
    for (const rate of sorted.slice(0, 3)) {
      const cancel = rate.cancelPolicy.refundable ? "Refundable" : "Non-refundable";
      lines.push(`    ${rate.price.nightly} ${rate.price.currency}/night | ${rate.boardName} | ${cancel}`);
    }
    if (sorted.length > 3) {
      lines.push(`    ... and ${sorted.length - 3} more offers`);
    }
    lines.push("");
  }

  lines.push(`offersKey: ${data.offersKey}`);

  return lines.join("\n");
}
