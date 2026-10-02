import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios') as { post: (...args: unknown[]) => Promise<unknown> };
import { fetchNearbyPlaces } from './overpassService';

const originalPost = axios.post;

afterEach(() => {
  axios.post = originalPost;
});

function el(overrides: Record<string, unknown> = {}) {
  return {
    type: 'node',
    id: 1,
    lat: 14.5,
    lon: 121.0,
    tags: { name: 'Test Spot', tourism: 'museum', fee: 'no' },
    ...overrides,
  };
}

// Distinct areas per test: results are cached by rounded coords.
const AREA = [10.001, 10.002, 10.003, 10.004, 10.005];

describe('fetchNearbyPlaces', () => {
  it('maps elements, drops hotels, dedupes double matches', async () => {
    axios.post = async () =>
      ({
        data: {
          elements: [
            el({ id: 1 }),
            el({ id: 1, tags: { name: 'Test Spot', 'name:en': 'Test Spot' } }),
            el({ id: 2, tags: { name: 'Big Hotel', tourism: 'hotel' } }),
            el({ id: 3, lat: undefined, lon: undefined }),
          ],
        },
      }) as unknown;
    const places = await fetchNearbyPlaces(AREA[0], 121.0, 1000);
    assert.equal(places.length, 1);
    assert.equal(places[0].osmId, 'node/1');
    assert.equal(places[0].isFree, true);
    assert.equal(places[0].category, 'tourist_spot');
  });

  it('first non-empty mirror wins the race', async () => {
    axios.post = async (url: unknown) => {
      if (String(url).includes('overpass-api.de')) return { data: { elements: [] } };
      await new Promise((r) => setTimeout(r, 50));
      return { data: { elements: [el({ id: 7 })] } };
    };
    const places = await fetchNearbyPlaces(AREA[1], 121.0, 1000);
    assert.equal(places.length, 1);
    assert.equal(places[0].osmId, 'node/7');
  });

  it('a fast tiny answer does not beat a slower complete one', async () => {
    const big = Array.from({ length: 25 }, (_, i) => el({ id: 100 + i }));
    axios.post = async (url: unknown) => {
      if (String(url).includes('overpass-api.de')) return { data: { elements: [el({ id: 1 })] } };
      await new Promise((r) => setTimeout(r, 50));
      return { data: { elements: big } };
    };
    const places = await fetchNearbyPlaces(10.006, 121.0, 1000);
    assert.equal(places.length, 25);
  });

  it('returns [] when every mirror answers empty', async () => {
    axios.post = async () => ({ data: { elements: [] } });
    const places = await fetchNearbyPlaces(AREA[2], 121.0, 1000);
    assert.deepEqual(places, []);
  });

  it('throws when every mirror fails', async () => {
    axios.post = async () => {
      throw new Error('boom');
    };
    await assert.rejects(() => fetchNearbyPlaces(AREA[3], 121.0, 1000), /Overpass API request failed/);
  });

  it('caches by area so repeats skip the network', async () => {
    let calls = 0;
    axios.post = async () => {
      calls++;
      return { data: { elements: [el({ id: 9 })] } };
    };
    await fetchNearbyPlaces(AREA[4], 121.0, 1000);
    await fetchNearbyPlaces(AREA[4], 121.0, 1000);
    // 2 queries x 3 mirrors on first call, zero on the cached repeat.
    assert.equal(calls, 6);
  });
});
