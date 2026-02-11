import { Airport } from "../client/types.js";

export function formatAirportList(airports: Airport[], query: string): string {
  if (airports.length === 0) {
    return `No airports found matching "${query}". Try a different search term (city name, airport name, or IATA code).`;
  }

  const lines: string[] = [`Found ${airports.length} result(s) matching "${query}":\n`];

  for (let i = 0; i < airports.length; i++) {
    const a = airports[i];
    const type = a.isAirport === false ? "City" : "Airport";
    const country = a.country ? `, ${a.country.titleEn}` : "";
    const city = a.city ? `${a.city.titleEn}, ` : "";

    lines.push(`${i + 1}. ${a.code} — ${a.titleEn} [${type}]`);
    lines.push(`   ${city}${a.country?.titleEn || ""}`);
  }

  return lines.join("\n");
}

export function formatAirportDetail(airport: Airport): string {
  const lines: string[] = [];

  const type = airport.isAirport === false ? "City" : "Airport";
  lines.push(`${type}: ${airport.titleEn} (${airport.code})`);

  if (airport.city) {
    lines.push(`City: ${airport.city.titleEn} (${airport.city.code})`);
  }

  if (airport.country) {
    lines.push(`Country: ${airport.country.titleEn} (${airport.country.code})`);
  }

  return lines.join("\n");
}
