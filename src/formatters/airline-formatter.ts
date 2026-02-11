import { Airline } from "../client/types.js";

export function formatAirlineList(airlines: Airline[], query: string): string {
  if (airlines.length === 0) {
    return `No airlines found matching "${query}". Try a different search term (airline name or IATA code).`;
  }

  const lines: string[] = [`Found ${airlines.length} airline(s) matching "${query}":\n`];

  for (let i = 0; i < airlines.length; i++) {
    const a = airlines[i];
    lines.push(`${i + 1}. ${a.code} — ${a.title}`);
  }

  return lines.join("\n");
}
