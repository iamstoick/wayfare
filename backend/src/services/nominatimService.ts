import axios from 'axios';

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
}

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export const searchLocations = async (query: string): Promise<GeocodeResult[]> => {
  try {
    const response = await axios.get<NominatimHit[]>(NOMINATIM_URL, {
      params: { q: query, format: 'json', limit: 5, addressdetails: 0 },
      headers: {
        // Nominatim usage policy requires an identifying User-Agent.
        'User-Agent': 'SpotHop/1.0 (travel itinerary planner)',
        'Accept-Language': 'en',
      },
      timeout: 10000,
    });

    return (response.data ?? []).map((hit) => ({
      displayName: hit.display_name,
      lat: Number(hit.lat),
      lng: Number(hit.lon),
    }));
  } catch (err) {
    throw new Error(`Nominatim request failed: ${(err as Error).message}`);
  }
};
