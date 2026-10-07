import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios') as { post: (...args: unknown[]) => Promise<unknown> };
import { fetchNearbyRentals, estimateRentalRates } from './rentalService';

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
    tags: { name: 'Test Rentals', amenity: 'car_rental' },
    ...overrides,
  };
}

// Distinct areas per test: results are cached by rounded coords.
const AREA = [20.001, 20.002, 20.003, 20.004, 20.005];

describe('estimateRentalRates', () => {
  it('returns PHP daily ranges per vehicle type', () => {
    const [car] = estimateRentalRates(['car']);
    assert.equal(car.currency, 'PHP');
    assert.ok(car.dailyMin > 0 && car.dailyMax > car.dailyMin);
    const [moto] = estimateRentalRates(['motorcycle']);
    assert.equal(moto.currency, 'PHP');
    assert.ok(moto.dailyMax < car.dailyMax);
  });

  it('covers both types when unknown', () => {
    const estimates = estimateRentalRates([]);
    assert.deepEqual(
      estimates.map((e) => e.vehicleType).sort(),
      ['car', 'motorcycle'],
    );
  });
});

describe('fetchNearbyRentals', () => {
  it('maps elements, classifies vehicle types, dedupes double matches', async () => {
    axios.post = async () =>
      ({
        data: {
          elements: [
            el({ id: 1 }),
            el({
              id: 1,
              tags: { name: 'Test Rentals', 'name:en': 'Test Rentals', amenity: 'car_rental' },
            }),
            el({ id: 2, tags: { name: 'Scoot Moto', shop: 'motorcycle', phone: '+63 2 1234' } }),
            el({ id: 3, tags: { name: 'Rent Anything', amenity: 'vehicle_rental' } }),
            el({ id: 4, lat: undefined, lon: undefined }),
          ],
        },
      }) as unknown;
    const rentals = await fetchNearbyRentals(AREA[0], 121.0, 5000);
    assert.equal(rentals.length, 3);
    assert.deepEqual(rentals[0].vehicleTypes, ['car']);
    assert.deepEqual(rentals[1].vehicleTypes, ['motorcycle']);
    assert.equal(rentals[1].phone, '+63 2 1234');
    assert.deepEqual(rentals[2].vehicleTypes, ['car', 'motorcycle']);
  });

  it('filters by vehicle type', async () => {
    axios.post = async () =>
      ({
        data: {
          elements: [
            el({ id: 1 }),
            el({ id: 2, tags: { name: 'Scoot', shop: 'motorcycle' } }),
          ],
        },
      }) as unknown;
    const cars = await fetchNearbyRentals(AREA[1], 121.0, 5000, 'car');
    assert.equal(cars.length, 1);
    assert.equal(cars[0].osmId, 'node/1');
    const motos = await fetchNearbyRentals(AREA[1], 121.0, 5000, 'motorcycle');
    assert.equal(motos.length, 1);
    assert.equal(motos[0].osmId, 'node/2');
  });

  it('returns [] when every mirror answers empty', async () => {
    axios.post = async () => ({ data: { elements: [] } });
    const rentals = await fetchNearbyRentals(AREA[2], 121.0, 5000);
    assert.deepEqual(rentals, []);
  });

  it('throws when every mirror fails', async () => {
    axios.post = async () => {
      throw new Error('boom');
    };
    await assert.rejects(() => fetchNearbyRentals(AREA[3], 121.0, 5000), /Overpass API request failed/);
  });

  it('caches by area so repeats skip the network', async () => {
    let calls = 0;
    axios.post = async () => {
      calls++;
      return { data: { elements: [el({ id: 9 })] } };
    };
    await fetchNearbyRentals(AREA[4], 121.0, 5000);
    assert.ok(calls > 0);
    const afterFirst = calls;
    await fetchNearbyRentals(AREA[4], 121.0, 5000);
    assert.equal(calls, afterFirst);
  });
});
