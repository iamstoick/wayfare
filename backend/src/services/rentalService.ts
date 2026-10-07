import axios from 'axios';

export type RentalVehicleType = 'car' | 'motorcycle';
export type RentalTypeFilter = 'all' | RentalVehicleType;

export interface RentalEstimate {
  vehicleType: RentalVehicleType;
  label: string;
  dailyMin: number;
  dailyMax: number;
  currency: string;
}

export interface RentalResult {
  osmId: string;
  name: string;
  lat: number;
  lng: number;
  vehicleTypes: RentalVehicleType[];
  openingHours?: string;
  phone?: string;
  website?: string;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface RawRental {
  osmId: string;
  name: string;
  lat?: number;
  lng?: number;
  vehicleTypes: RentalVehicleType[];
  openingHours: string;
  phone?: string;
  website?: string;
}

// Typical Metro Manila walk-in rates per 24h day, excluding fuel and deposit.
// OSM rarely records prices, so these are planning estimates, not quotes.
const ESTIMATES: Record<RentalVehicleType, Omit<RentalEstimate, 'vehicleType'>> = {
  car: { label: 'Car', dailyMin: 2500, dailyMax: 4500, currency: 'PHP' },
  motorcycle: { label: 'Motorcycle / Scooter', dailyMin: 500, dailyMax: 1200, currency: 'PHP' },
};

export function estimateRentalRates(vehicleTypes: RentalVehicleType[]): RentalEstimate[] {
  const types =
    vehicleTypes.length > 0 ? vehicleTypes : (['car', 'motorcycle'] as RentalVehicleType[]);
  return types.map((vehicleType) => ({ vehicleType, ...ESTIMATES[vehicleType] }));
}

// overpass-api.de 406s without an explicit JSON Accept header; the rest are fallbacks.
const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_URL,
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
].filter((url): url is string => !!url);

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map<string, { at: number; value: RentalResult[] }>();

const MOTO_NAME = /moto|scooter|bike|harley|yamaha|kawasaki|vespa/i;
const CAR_NAME = /car|auto|avis|hertz|budget|toyota|sedan|suv|van/i;

function classifyRental(tags: Record<string, string>, name: string): RentalVehicleType[] {
  const amenity = tags.amenity ?? '';
  const shop = tags.shop ?? '';
  const motoTagged =
    amenity === 'motorcycle_rental' ||
    shop === 'motorcycle' ||
    tags['rental:motorcycle'] === 'yes' ||
    tags.motorcycle === 'yes';
  const carTagged =
    amenity === 'car_rental' ||
    shop === 'car' ||
    tags['rental:car'] === 'yes' ||
    tags['rental:cars'] === 'yes' ||
    tags.rental === 'cars';
  if (motoTagged && !carTagged) return ['motorcycle'];
  if (carTagged && !motoTagged) return ['car'];
  if (motoTagged && carTagged) return ['car', 'motorcycle'];
  // Generic rental tags: guess from the name, else cover both.
  const motoName = MOTO_NAME.test(name);
  const carName = CAR_NAME.test(name);
  if (motoName && !carName) return ['motorcycle'];
  if (carName && !motoName) return ['car'];
  return ['car', 'motorcycle'];
}

export const fetchNearbyRentals = async (
  lat: number,
  lng: number,
  radiusMeters: number,
  typeFilter: RentalTypeFilter = 'all',
): Promise<RentalResult[]> => {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}:${radiusMeters}`;
  const cached = cache.get(cacheKey);
  const fresh = cached && Date.now() - cached.at < CACHE_TTL_MS ? cached.value : null;
  const all = fresh ?? (await queryRentals(lat, lng, radiusMeters));
  if (!fresh) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(cacheKey, { at: Date.now(), value: all });
  }
  if (typeFilter === 'all') return all;
  return all.filter((r) => r.vehicleTypes.includes(typeFilter));
};

async function queryRentals(
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<RentalResult[]> {
  const around = `around:${radiusMeters},${lat},${lng}`;
  const query = `
    [out:json][timeout:60];
    (
      node["amenity"="car_rental"](${around});
      node["amenity"="motorcycle_rental"](${around});
      node["amenity"="vehicle_rental"](${around});
      node["shop"="rental"](${around});
      node["shop"="motorcycle"](${around});
      node["shop"="car"]["rental"="yes"](${around});
      way["amenity"="car_rental"](${around});
      way["amenity"="vehicle_rental"](${around});
      way["shop"="motorcycle"](${around});
    );
    out tags center;
  `;

  const elements = await raceMirrors(query);

  // Objects matching several selectors (e.g. name + name:en): dedupe.
  const seen = new Set<string>();
  return elements
    .filter((el) => el.tags)
    .filter((el) => {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((el): RawRental => {
      const tags = el.tags!;
      const name =
        tags['name:en'] || tags.name || tags.operator || tags.brand || 'Vehicle rental';
      const phone = tags.phone || tags['contact:phone'];
      const website = tags.website || tags['contact:website'];
      return {
        osmId: `${el.type}/${el.id}`,
        name,
        lat: el.lat ?? el.center?.lat,
        lng: el.lon ?? el.center?.lon,
        vehicleTypes: classifyRental(tags, name),
        openingHours: tags.opening_hours || 'Not specified',
        ...(phone ? { phone } : {}),
        ...(website ? { website } : {}),
      };
    })
    .filter(
      (rental): rental is RawRental & { lat: number; lng: number } =>
        typeof rental.lat === 'number' && typeof rental.lng === 'number',
    );
}

// Race all mirrors: rentals are sparse, so the first non-empty answer wins;
// otherwise the largest answer after every mirror settles wins.
function raceMirrors(query: string): Promise<OverpassElement[]> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let best: OverpassElement[] = [];
    let settled = 0;
    let done = false;
    const errors: unknown[] = [];

    const finish = () => {
      if (done) return;
      done = true;
      controller.abort();
      if (best.length > 0) {
        resolve(best);
        return;
      }
      if (errors.length > 0) {
        const last = errors[errors.length - 1] as Error;
        reject(new Error(`Overpass API request failed: ${last?.message ?? 'all mirrors failed'}`));
        return;
      }
      resolve([]);
    };

    const fetchFrom = async (endpoint: string): Promise<void> => {
      try {
        const response = await axios.post(endpoint, `data=${encodeURIComponent(query)}`, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'SpotHop/1.0 (travel itinerary planner)',
          },
          timeout: 60000,
          signal: controller.signal,
        });
        if (done) return;
        const batch: OverpassElement[] = response.data?.elements ?? [];
        if (batch.length > best.length) best = batch;
        if (batch.length > 0) {
          finish();
          return;
        }
      } catch (err) {
        if (done) return;
        errors.push(err);
      }
      settled++;
      if (settled === OVERPASS_ENDPOINTS.length) finish();
    };

    OVERPASS_ENDPOINTS.forEach((url) => void fetchFrom(url));
  });
}
