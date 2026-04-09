import {
  FlightStatus,
  FlightEndpoint,
  BoardFlight,
  FlightDelayStats,
  AirportDelayStats,
} from "../client/types.js";

// --- Helpers ---

function extractLocalTime(endpoint: FlightEndpoint): string | undefined {
  const time =
    endpoint.actualTime?.local ||
    endpoint.revisedTime?.local ||
    endpoint.predictedTime?.local ||
    endpoint.scheduledTime?.local;
  if (!time) return undefined;
  // Extract HH:mm from ISO string
  const match = time.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : time;
}

function extractScheduledTime(endpoint: FlightEndpoint): string | undefined {
  const time = endpoint.scheduledTime?.local;
  if (!time) return undefined;
  const match = time.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : time;
}

function airportLabel(endpoint: FlightEndpoint): string {
  const iata = endpoint.airport?.iata || "";
  const name = endpoint.airport?.shortName || endpoint.airport?.name || endpoint.airport?.municipalityName || "";
  if (iata && name) return `${name} (${iata})`;
  return iata || name || "Unknown";
}

function delayText(endpoint: FlightEndpoint): string {
  const scheduled = endpoint.scheduledTime?.local;
  const actual = endpoint.actualTime?.local || endpoint.revisedTime?.local || endpoint.predictedTime?.local;
  if (!scheduled || !actual) return "";

  const schedDate = new Date(scheduled);
  const actualDate = new Date(actual);
  const diffMin = Math.round((actualDate.getTime() - schedDate.getTime()) / 60000);

  if (diffMin <= 0) return "On time";
  return `+${diffMin} min delay`;
}

// --- Flight Status ---

function formatOneFlight(flight: FlightStatus): string[] {
  const lines: string[] = [];

  const airline = flight.airline?.name || "";
  const flightNum = flight.number || "";
  const status = flight.status || "Unknown";

  lines.push(`${flightNum} ${airline ? `— ${airline}` : ""}`);
  lines.push(`Status: ${status}`);
  lines.push("");

  // Departure
  const depAirport = airportLabel(flight.departure);
  const depScheduled = extractScheduledTime(flight.departure);
  const depActual = extractLocalTime(flight.departure);
  const depDelay = delayText(flight.departure);

  lines.push(`Departure: ${depAirport}`);
  if (depScheduled) lines.push(`  Scheduled: ${depScheduled}${flight.departure.terminal ? ` (Terminal ${flight.departure.terminal})` : ""}${flight.departure.gate ? `, Gate ${flight.departure.gate}` : ""}`);
  if (depActual && depActual !== depScheduled) lines.push(`  Actual:    ${depActual} ${depDelay}`);
  else if (depDelay) lines.push(`  ${depDelay}`);

  // Arrival
  const arrAirport = airportLabel(flight.arrival);
  const arrScheduled = extractScheduledTime(flight.arrival);
  const arrActual = extractLocalTime(flight.arrival);
  const arrDelay = delayText(flight.arrival);

  lines.push(`Arrival: ${arrAirport}`);
  if (arrScheduled) lines.push(`  Scheduled: ${arrScheduled}${flight.arrival.terminal ? ` (Terminal ${flight.arrival.terminal})` : ""}${flight.arrival.gate ? `, Gate ${flight.arrival.gate}` : ""}`);
  if (arrActual && arrActual !== arrScheduled) lines.push(`  Estimated: ${arrActual} ${arrDelay}`);
  else if (arrDelay) lines.push(`  ${arrDelay}`);

  if (flight.arrival.baggageBelt) {
    lines.push(`  Baggage belt: ${flight.arrival.baggageBelt}`);
  }

  // Aircraft
  if (flight.aircraft) {
    const parts: string[] = [];
    if (flight.aircraft.model) parts.push(flight.aircraft.model);
    if (flight.aircraft.reg) parts.push(`(${flight.aircraft.reg})`);
    if (parts.length > 0) {
      lines.push("");
      lines.push(`Aircraft: ${parts.join(" ")}`);
    }
  }

  // Distance
  if (flight.greatCircleDistance?.km) {
    lines.push(`Distance: ${Math.round(flight.greatCircleDistance.km).toLocaleString()} km`);
  }

  // Location (if in-flight)
  if (flight.location?.lat && flight.location?.lon) {
    lines.push("");
    lines.push(`Current position: ${flight.location.lat.toFixed(2)}°, ${flight.location.lon.toFixed(2)}°`);
    if (flight.location.pressureAltFt) {
      lines.push(`Altitude: ${flight.location.pressureAltFt.toLocaleString()} ft`);
    }
  }

  return lines;
}

export function formatFlightStatus(flights: FlightStatus[], flightNumber: string, date: string): string {
  if (!flights || flights.length === 0) {
    return `No flight data found for ${flightNumber} on ${date}. Check the flight number and date.`;
  }

  const lines: string[] = [`Flight status: ${flightNumber} | ${date}\n`];

  for (let i = 0; i < flights.length; i++) {
    if (flights.length > 1) {
      lines.push(`--- Leg ${i + 1} ---`);
    }
    lines.push(...formatOneFlight(flights[i]));
    if (i < flights.length - 1) lines.push("");
  }

  return lines.join("\n");
}

// --- Airport Board ---

export function formatAirportBoard(
  flights: BoardFlight[],
  airportCode: string,
  direction: string,
  fromTime: string,
  toTime: string
): string {
  const label = direction === "departure" ? "Departures" : "Arrivals";
  const lines: string[] = [`${label} — ${airportCode} | ${fromTime} to ${toTime}\n`];

  if (!flights || flights.length === 0) {
    lines.push(`No ${direction}s found for this time window.`);
    return lines.join("\n");
  }

  lines.push(`${flights.length} flight(s):\n`);

  for (let i = 0; i < flights.length; i++) {
    const f = flights[i];
    const num = f.number || "—";
    const airline = f.airline?.name || f.airline?.iata || "";
    const status = f.status || "";

    let destination: string;
    let time: string;
    let terminal: string;
    let gate: string;

    if (direction === "departure") {
      destination = airportLabel(f.arrival);
      time = extractScheduledTime(f.departure) || "—";
      terminal = f.departure.terminal || "";
      gate = f.departure.gate || "";
    } else {
      destination = airportLabel(f.departure);
      time = extractScheduledTime(f.arrival) || "—";
      terminal = f.arrival.terminal || "";
      gate = f.arrival.gate || "";
    }

    const statusBadge = status ? ` [${status}]` : "";
    const termGate = [terminal ? `T${terminal}` : "", gate ? `Gate ${gate}` : ""].filter(Boolean).join(", ");

    lines.push(`${i + 1}. ${time} | ${num} ${airline} → ${destination}${statusBadge}`);
    if (termGate) lines.push(`   ${termGate}`);
  }

  return lines.join("\n");
}

// --- Flight Delay Statistics ---

export function formatFlightDelayStats(stats: FlightDelayStats, flightNumber: string): string {
  const lines: string[] = [`Delay statistics: ${flightNumber}`];

  if (stats.route?.from && stats.route?.to) {
    lines[0] += ` (${stats.route.from} → ${stats.route.to})`;
  }
  lines.push("");

  if (stats.observations !== undefined) {
    lines.push(`Based on ${stats.observations} recent observations\n`);
  }

  if (stats.onTimePercentage !== undefined) {
    lines.push(`On-time (< 15 min): ${stats.onTimePercentage.toFixed(0)}%`);
  }

  if (stats.delayDistribution) {
    for (const bucket of stats.delayDistribution) {
      if (bucket.bucket && bucket.percentage !== undefined) {
        lines.push(`Delayed ${bucket.bucket} min: ${bucket.percentage.toFixed(0)}%`);
      }
    }
  }

  if (stats.cancelledPercentage !== undefined) {
    lines.push(`Cancelled: ${stats.cancelledPercentage.toFixed(1)}%`);
  }

  lines.push("");

  if (stats.averageDelayMin !== undefined) {
    lines.push(`Average delay: ${Math.round(stats.averageDelayMin)} min`);
  }
  if (stats.medianDelayMin !== undefined) {
    lines.push(`Median delay: ${Math.round(stats.medianDelayMin)} min`);
  }

  // Assessment
  lines.push("");
  if (stats.onTimePercentage !== undefined) {
    if (stats.onTimePercentage >= 80) {
      lines.push("Assessment: Very reliable — on time most flights.");
    } else if (stats.onTimePercentage >= 60) {
      lines.push("Assessment: Generally reliable — on time about 2 out of 3 flights.");
    } else if (stats.onTimePercentage >= 40) {
      lines.push("Assessment: Moderate delays — frequently delayed.");
    } else {
      lines.push("Assessment: Unreliable — often delayed significantly.");
    }
  }

  return lines.join("\n");
}

// --- Airport Delay Statistics ---

export function formatAirportDelayStats(stats: AirportDelayStats, airportCode: string, date: string): string {
  const airportName = stats.airport?.name || airportCode;
  const lines: string[] = [`Airport delay statistics: ${airportName} (${airportCode}) | ${date}\n`];

  if (stats.departures) {
    const d = stats.departures;
    lines.push("Departures:");
    if (d.averageDelayMin !== undefined) lines.push(`  Average delay: ${Math.round(d.averageDelayMin)} min`);
    if (d.medianDelayMin !== undefined) lines.push(`  Median delay: ${Math.round(d.medianDelayMin)} min`);
    if (d.cancellations !== undefined && d.totalFlights !== undefined) {
      const pct = d.totalFlights > 0 ? ((d.cancellations / d.totalFlights) * 100).toFixed(1) : "0";
      lines.push(`  Cancellations: ${d.cancellations} of ${d.totalFlights} flights (${pct}%)`);
    }
    lines.push(`  Status: ${assessDelay(d.averageDelayMin)}`);
    lines.push("");
  }

  if (stats.arrivals) {
    const a = stats.arrivals;
    lines.push("Arrivals:");
    if (a.averageDelayMin !== undefined) lines.push(`  Average delay: ${Math.round(a.averageDelayMin)} min`);
    if (a.medianDelayMin !== undefined) lines.push(`  Median delay: ${Math.round(a.medianDelayMin)} min`);
    if (a.cancellations !== undefined && a.totalFlights !== undefined) {
      const pct = a.totalFlights > 0 ? ((a.cancellations / a.totalFlights) * 100).toFixed(1) : "0";
      lines.push(`  Cancellations: ${a.cancellations} of ${a.totalFlights} flights (${pct}%)`);
    }
    lines.push(`  Status: ${assessDelay(a.averageDelayMin)}`);
  }

  return lines.join("\n");
}

function assessDelay(avgDelayMin: number | undefined): string {
  if (avgDelayMin === undefined) return "No data";
  if (avgDelayMin <= 10) return "Normal operations";
  if (avgDelayMin <= 20) return "Minor delays";
  if (avgDelayMin <= 40) return "Moderate delays";
  return "Severe delays";
}
