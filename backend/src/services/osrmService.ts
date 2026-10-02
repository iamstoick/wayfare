import axios from 'axios';

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry?: { coordinates?: Array<[number, number]> };
  }>;
}

const OSRM_URL = 'https://router.project-osrm.org/route/v1';

// Best-effort road geometry for ordered stops. Returns [lat, lng] pairs,
// or null when OSRM is unreachable so callers can fall back to straight lines.
export type OsrmProfile = 'driving' | 'foot' | 'bike';

export const fetchRouteGeometry = async (
  stops: Array<{ lat: number; lng: number }>,
  profile: OsrmProfile = 'driving',
): Promise<Array<[number, number]> | null> => {
  if (stops.length < 2) return null;

  const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  try {
    const response = await axios.get<OsrmRouteResponse>(
      `${OSRM_URL}/${profile}/${coords}?overview=full&geometries=geojson`,
      { timeout: 10000 },
    );
    const line = response.data?.routes?.[0]?.geometry?.coordinates;
    if (!line || line.length === 0) return null;
    return line.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return null;
  }
};
