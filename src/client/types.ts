// --- Airports ---

export interface AirportCountry {
  title: string;
  titleEn: string;
  code: string;
}

export interface AirportCity {
  code: string;
  title: string;
  titleEn: string;
}

export interface Airport {
  id: string | number;
  code: string;
  title: string;
  titleEn: string;
  country?: AirportCountry;
  city?: AirportCity;
  isAirport?: boolean;
  sort?: number;
}

// --- Airlines ---

export interface Airline {
  id: number;
  code: string;
  title: string;
}

// --- Flight Search ---

export interface FlightSearchRequest {
  locationFrom: string;
  locationTo: string;
  date: string; // DD.MM.YYYY
  dateEnd?: string; // DD.MM.YYYY or empty for one-way
  cabinClass: string;
  adults: number;
  children: number;
  infants: number;
  airlines?: string[];
}

export interface FlightSearchCreateResponse {
  status: string;
  errors: string[];
  warnings: string[];
  cacheId: string;
  countServices: number;
  countFinishedServices: number;
  countFailedServices: number;
  count: number;
  completed: boolean;
}

// --- Flight Search Results ---

export interface FlightSegmentEndpoint {
  iata_code: string;
  at: string; // ISO 8601
  terminal: string;
  airport: {
    iata_code: string;
    title: string;
  };
}

export interface FlightSegment {
  departure: FlightSegmentEndpoint;
  arrival: FlightSegmentEndpoint;
  carrier_code: string;
  number: string;
  duration: string;
  cabin: string;
}

export interface FlightItinerary {
  duration: string;
  segments: FlightSegment[];
  transfers: number;
}

export interface FlightPrice {
  currency: string;
  totalPrice: number;
  inclusivePrice: number;
  exclusivePrice: number;
}

export interface FlightOfferItem {
  service: string;
  type: string; // "rt" for round-trip, "ow" for one-way
  availableSeats: number;
  cabinClass: string;
  airline: string;
  includeBaggage: boolean;
  include_baggage?: {
    count: number;
    unit: string;
  };
  price: FlightPrice;
  itineraries: FlightItinerary[];
  id: number;
}

export interface FlightOffer {
  totalPrice: number;
  totalPriceNet: number;
  durationTime: string;
  items: FlightOfferItem[];
}

export interface DictionaryAirport {
  title: string;
  titleEn: string;
  city?: {
    code: string;
    title: string;
    titleEn: string;
  };
  country?: {
    code: string;
    title: string;
    titleEn: string;
  };
}

export interface FlightSearchResultsResponse {
  status: string;
  cacheId: string;
  items: FlightOffer[];
  total: number;
  limit: number;
  offset: number;
  currency: string;
  currencySign: string;
  completed?: boolean;
  countServices?: number;
  countFinishedServices?: number;
  countFailedServices?: number;
  count?: number;
  airlines?: Record<string, string>;
  filters?: string[];
  dictionaries?: {
    airports?: Record<string, DictionaryAirport>;
  };
}

// --- AeroDataBox: Flight Status ---

export interface AeroFlightTime {
  utc?: string;
  local?: string;
}

export interface AeroFlightEndpoint {
  airport?: {
    icao?: string;
    iata?: string;
    name?: string;
    shortName?: string;
    municipalityName?: string;
    location?: { lat?: number; lon?: number };
    countryCode?: string;
  };
  scheduledTime?: AeroFlightTime;
  revisedTime?: AeroFlightTime;
  predictedTime?: AeroFlightTime;
  actualTime?: AeroFlightTime;
  terminal?: string;
  gate?: string;
  baggageBelt?: string;
  checkInDesk?: string;
  quality?: string[];
}

export interface AeroFlightAircraft {
  reg?: string;
  modeS?: string;
  model?: string;
  image?: {
    url?: string;
    webUrl?: string;
    author?: string;
    title?: string;
    description?: string;
  };
}

export interface AeroFlightStatus {
  type?: string;
  status?: string;
  departure: AeroFlightEndpoint;
  arrival: AeroFlightEndpoint;
  number?: string;
  callSign?: string;
  airline?: {
    name?: string;
    iata?: string;
    icao?: string;
  };
  aircraft?: AeroFlightAircraft;
  location?: {
    pressureAltFt?: number;
    gsKt?: number;
    lat?: number;
    lon?: number;
  };
  codeshareStatus?: string;
  isCargo?: boolean;
  greatCircleDistance?: {
    meter?: number;
    km?: number;
    mile?: number;
  };
}

export type AeroFlightStatusResponse = AeroFlightStatus[];

// --- AeroDataBox: Airport Flights Board ---

export interface AeroBoardFlight {
  departure: AeroFlightEndpoint;
  arrival: AeroFlightEndpoint;
  number?: string;
  status?: string;
  codeshareStatus?: string;
  isCargo?: boolean;
  airline?: {
    name?: string;
    iata?: string;
    icao?: string;
  };
  aircraft?: {
    model?: string;
    reg?: string;
  };
}

export interface AeroAirportBoardResponse {
  departures?: AeroBoardFlight[];
  arrivals?: AeroBoardFlight[];
}

// --- AeroDataBox: Flight Delay Statistics ---

export interface AeroFlightDelayStats {
  route?: {
    from?: string;
    to?: string;
  };
  averageDelayMin?: number;
  cancelledPercentage?: number;
  delayDistribution?: Array<{
    bucket?: string;
    percentage?: number;
  }>;
  medianDelayMin?: number;
  onTimePercentage?: number;
  observations?: number;
}

// --- AeroDataBox: Airport Delay Statistics ---

export interface AeroAirportDelayInfo {
  averageDelayMin?: number;
  delayIndex?: number;
  medianDelayMin?: number;
  cancellations?: number;
  totalFlights?: number;
}

export interface AeroAirportDelayStats {
  airport?: {
    iata?: string;
    name?: string;
  };
  date?: string;
  departures?: AeroAirportDelayInfo;
  arrivals?: AeroAirportDelayInfo;
}

// --- Errors ---

export interface ApiErrorResponse {
  code: number;
  message: string;
}
