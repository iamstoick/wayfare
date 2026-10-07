const API_BASE =
  import.meta.env.VITE_API_URL?.trim() || 'http://localhost:5001/api';

const TOKEN_KEY = 'spothop_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}, auth = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error('Not signed in');
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
}

export type TripMode = 'day' | 'multi' | 'layover';
export type Pace = 'relaxed' | 'standard' | 'packed';
export type TransportMode = 'walk' | 'bike' | 'transit' | 'drive';

export interface Place {
  osmId: string;
  name: string;
  lat: number;
  lng: number;
  category: 'tourist_spot' | 'restaurant';
  openingHours?: string;
  isFree: boolean;
  distanceKm: number;
  openNow: boolean | null;
}

export type RentalVehicleType = 'car' | 'motorcycle';
export type RentalTypeFilter = 'all' | RentalVehicleType;

export interface RentalEstimate {
  vehicleType: RentalVehicleType;
  label: string;
  dailyMin: number;
  dailyMax: number;
  currency: string;
}

export interface Rental {
  osmId: string;
  name: string;
  lat: number;
  lng: number;
  vehicleTypes: RentalVehicleType[];
  openingHours?: string;
  phone?: string;
  website?: string;
  distanceKm: number;
  openNow: boolean | null;
  estimates: RentalEstimate[];
}

export interface ItineraryStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  isFree: boolean;
  stepOrder: number;
  estimatedTime: string;
  openingHours?: string;
}

export interface DayPlan {
  dayIndex: number;
  dateISO: string | null;
  stops: ItineraryStop[];
  geometry: Array<[number, number]> | null;
}

export interface Hotel {
  lat: number;
  lng: number;
  name?: string;
}

export interface GenerateOptions {
  lat: number;
  lng: number;
  radiusKm: number;
  freeOnly: boolean;
  includeMeals?: boolean;
  mode?: TripMode;
  numDays?: number;
  startTime?: string;
  startDate?: string;
  pace?: Pace;
  transport?: TransportMode;
  skipClosed?: boolean;
  budgetMinutes?: number;
  bufferMinutes?: number;
  hotel?: Hotel;
}

export interface GenerateResult {
  days: DayPlan[];
  returnBy?: string;
  summary: { totalStops: number; totalDays: number };
  hotel: Hotel;
}

export interface GeocodeHit {
  displayName: string;
  lat: number;
  lng: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface TripItem {
  id: string;
  osmId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address?: string | null;
  openingHours?: string | null;
  isFree: boolean;
  orderIndex: number;
  visitTime?: string | null;
  dayIndex: number;
}

export interface Trip {
  id: string;
  title: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  mode: TripMode;
  numDays: number;
  startDate: string | null;
  hotelLat: number | null;
  hotelLng: number | null;
  hotelName: string | null;
  createdAt: string;
  updatedAt: string;
  items: TripItem[];
  _count?: { items: number };
}

export interface Enrichment {
  title: string;
  description: string;
  thumbnailUrl?: string;
  wikipediaUrl: string;
}

export const api = {
  geocode: (q: string) =>
    request<{ results: GeocodeHit[] }>(`/geocode?q=${encodeURIComponent(q)}`),

  getPlaces: (lat: number, lng: number, radiusKm: number, freeOnly: boolean) =>
    request<{ places: Place[] }>(
      `/places?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}&freeOnly=${freeOnly}`,
    ),

  getRentals: (lat: number, lng: number, radiusKm: number, type: RentalTypeFilter = 'all') =>
    request<{ rentals: Rental[] }>(
      `/rentals?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}&type=${type}`,
    ),

  enrich: (lat: number, lng: number, name: string) =>
    request<{ enrichment: Enrichment | null }>(
      `/places/enrich?lat=${lat}&lng=${lng}&name=${encodeURIComponent(name)}`,
    ),

  generate: (opts: GenerateOptions) =>
    request<GenerateResult>('/itineraries/generate', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),

  retime: (args: {
    startLat: number;
    startLng: number;
    stops: ItineraryStop[];
    pace: Pace;
    transport: TransportMode;
    startTime: string;
  }) =>
    request<{ stops: ItineraryStop[]; geometry: Array<[number, number]> | null }>(
      '/itineraries/retime',
      { method: 'POST', body: JSON.stringify(args) },
    ),

  googleLogin: (idToken: string) =>
    request<{ token: string; user: AuthUser }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  listTrips: () => request<{ trips: Trip[] }>('/itineraries', {}, true),

  getTrip: (id: string) => request<{ trip: Trip }>(`/itineraries/${id}`, {}, true),

  saveTrip: (trip: {
    title: string;
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    mode: TripMode;
    numDays: number;
    startDate?: string;
    hotelLat?: number;
    hotelLng?: number;
    hotelName?: string;
    items: Array<{
      osmId: string;
      name: string;
      category: string;
      lat: number;
      lng: number;
      openingHours?: string;
      isFree: boolean;
      orderIndex: number;
      visitTime?: string;
      dayIndex: number;
    }>;
  }) =>
    request<{ trip: Trip }>(
      '/itineraries',
      { method: 'POST', body: JSON.stringify(trip) },
      true,
    ),

  deleteTrip: (id: string) =>
    request<void>(`/itineraries/${id}`, { method: 'DELETE' }, true),
};
