import axios from 'axios';

export interface PlaceResult {
  osmId: string;
  name: string;
  lat: number;
  lng: number;
  category: 'tourist_spot' | 'restaurant';
  openingHours?: string;
  isFree: boolean;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// overpass-api.de 406s without an explicit JSON Accept header; the rest are fallbacks.
const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_URL,
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
].filter((url): url is string => !!url);

// Named-place results change slowly: cache by rounded area for 30 minutes
// so regenerate / add-meals / retries don't hammer struggling mirrors.
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map<string, { at: number; value: PlaceResult[] }>();

export const fetchNearbyPlaces = async (
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<PlaceResult[]> => {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}:${radiusMeters}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  // Named tourist attractions, museums, viewpoints, parks, historic sites,
  // plus restaurants and cafes. The ["name"] selectors and `out tags`
  // (tags + coords only, no way member nodes) keep the response small
  // enough for loaded mirrors to answer in time.
  const around = `around:${radiusMeters},${lat},${lng}`;
  // Nodes carry ~92% of named results and answer much faster than ways
  // (no geometry loading), so they are the required fast path; tourism
  // ways are a best-effort enhancement merged in when mirrors cooperate.
  const nodeQuery = `
    [out:json][timeout:100];
    (
      node["tourism"]["name"](${around});
      node["amenity"="restaurant"]["name"](${around});
      node["amenity"="cafe"]["name"](${around});
    );
    out tags;
  `;
  const wayQuery = `
    [out:json][timeout:100];
    way["tourism"]["name"](${around});
    out tags center;
  `;

  // Race all mirrors: overloaded instances shed load unpredictably
  // (timeouts, 504s, empty 200s, even partial 200s), so a lone tiny answer
  // must not steal the win from a complete one still in flight. The first
  // answer with at least PARTIAL_GUARD_MIN elements wins immediately;
  // otherwise the largest answer after every mirror settles wins.
  const PARTIAL_GUARD_MIN = 20;

  const fetchQuery = (query: string): Promise<OverpassElement[]> =>
    new Promise((resolve, reject) => {
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
            timeout: 120000,
            signal: controller.signal,
          });
          if (done) return;
          const batch: OverpassElement[] = response.data?.elements ?? [];
          if (batch.length > best.length) best = batch;
          if (batch.length >= PARTIAL_GUARD_MIN) {
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

  const [nodeElements, wayElements] = await Promise.all([
    fetchQuery(nodeQuery),
    fetchQuery(wayQuery).catch(() => [] as OverpassElement[]),
  ]);
  const elements = [...nodeElements, ...wayElements];

  interface RawPlace {
    osmId: string;
    name: string;
    lat?: number;
    lng?: number;
    category: 'tourist_spot' | 'restaurant';
    openingHours?: string;
    isFree: boolean;
    tourism?: string;
  }

  // Accommodation isn't sightseeing: drop hotels/hostels from tourist spots.
  const ACCOMMODATION = new Set([
    'hotel',
    'hostel',
    'motel',
    'guest_house',
    'apartment',
    'chalet',
    'camp_site',
    'caravan_site',
    'alpine_hut',
  ]);

  // Objects carrying both name and name:en match two selectors: dedupe.
  const seen = new Set<string>();
  const results = elements
    .filter((el) => el.tags && (el.tags.name || el.tags['name:en']))
    .filter((el) => {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((el) => !ACCOMMODATION.has(el.tags!.tourism ?? ''))
    .map((el): RawPlace => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      const isRestaurant =
        el.tags!.amenity === 'restaurant' || el.tags!.amenity === 'cafe';

      return {
        osmId: `${el.type}/${el.id}`,
        tourism: el.tags!.tourism,
        name: el.tags!['name:en'] || el.tags!.name,
        lat: elLat,
        lng: elLng,
        category: (isRestaurant ? 'restaurant' : 'tourist_spot') as PlaceResult['category'],
        openingHours: el.tags!.opening_hours || 'Not specified',
        // OSM fee tag check: 'no' means free entrance.
        isFree: el.tags!.fee === 'no' || el.tags!.charge === '0' || !el.tags!.fee,
      };
    })
    .filter(
      (place): place is RawPlace & { lat: number; lng: number } =>
        typeof place.lat === 'number' && typeof place.lng === 'number',
    )
    .map(({ tourism: _tourism, ...place }) => place);

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(cacheKey, { at: Date.now(), value: results });
  return results;
};
