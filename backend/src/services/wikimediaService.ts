import axios from 'axios';

export interface Enrichment {
  title: string;
  description: string;
  thumbnailUrl?: string;
  wikipediaUrl: string;
}

interface GeosearchHit {
  pageid: number;
  title: string;
}

interface WikiDetail {
  title: string;
  extract?: string;
  thumbnail?: { source: string };
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'SpotHop/1.0 (travel itinerary planner; contact: spothop-local)';
const CACHE_TTL_MS = 24 * 3600 * 1000;
const CACHE_MAX = 500;

const cache = new Map<string, { at: number; value: Enrichment | null }>();

function titleMatches(candidate: string, name: string): boolean {
  const a = candidate.toLowerCase().trim();
  const b = name.toLowerCase().trim();
  return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
}

// Best-effort Wikipedia summary + thumbnail for a place. Null when nothing
// relevant is found. Results are cached in-memory for 24h.
export async function enrichPlace(
  lat: number,
  lng: number,
  name: string,
): Promise<Enrichment | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}|${name.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const gs = await axios.get(WIKI_API, {
      params: {
        action: 'query',
        list: 'geosearch',
        gscoord: `${lat}|${lng}`,
        gsradius: 150,
        gslimit: 5,
        format: 'json',
      },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    const hits: GeosearchHit[] = gs.data?.query?.geosearch ?? [];
    if (hits.length === 0) {
      cache.set(key, { at: Date.now(), value: null });
      return null;
    }
    const pick = hits.find((h) => titleMatches(h.title, name)) ?? hits[0];

    const detail = await axios.get(WIKI_API, {
      params: {
        action: 'query',
        pageids: pick.pageid,
        prop: 'pageimages|extracts',
        pithumbsize: 400,
        exintro: 1,
        explaintext: 1,
        exsentences: 2,
        format: 'json',
      },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    const page = detail.data?.query?.pages?.[pick.pageid] as WikiDetail | undefined;
    if (!page) {
      cache.set(key, { at: Date.now(), value: null });
      return null;
    }

    const value: Enrichment = {
      title: page.title,
      description: (page.extract ?? '').trim().slice(0, 500),
      thumbnailUrl: page.thumbnail?.source,
      wikipediaUrl: `https://en.wikipedia.org/?curid=${pick.pageid}`,
    };
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}
