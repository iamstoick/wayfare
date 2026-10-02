import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOptimizedItinerary,
  generateMultiDayItinerary,
  retimeRoute,
  type Location,
} from './optimizer';

function spot(id: string, lat: number, lng: number): Location {
  return { id, name: id, lat, lng, category: 'tourist_spot', isFree: true };
}

function restaurant(id: string, lat: number, lng: number): Location {
  return { id, name: id, lat, lng, category: 'restaurant', isFree: true };
}

describe('generateOptimizedItinerary', () => {
  it('visits spots nearest-first starting at 09:00', () => {
    const stops = generateOptimizedItinerary(0, 0, [spot('far', 0, 0.1), spot('near', 0, 0.001)], []);
    assert.equal(stops.length, 2);
    assert.equal(stops[0].name, 'near');
    assert.equal(stops[0].stepOrder, 1);
    assert.equal(stops[0].estimatedTime, '09:00');
    assert.equal(stops[1].name, 'far');
  });

  it('inserts a lunch stop at midday', () => {
    const spots = [
      spot('a', 0, 0.001),
      spot('b', 0, 0.002),
      spot('c', 0, 0.003),
      spot('d', 0, 0.004),
      spot('e', 0, 0.005),
    ];
    const stops = generateOptimizedItinerary(0, 0, spots, [restaurant('food', 0, 0.001)], {
      includeMeals: true,
    });
    const lunch = stops.find((s) => s.category === 'restaurant');
    assert.ok(lunch, 'expected a lunch stop');
    assert.match(lunch.estimatedTime, /\(Meal Stop\)/);
    assert.ok(lunch.estimatedTime.startsWith('12:'), `got ${lunch.estimatedTime}`);
    assert.ok(lunch.stepOrder > 1, 'lunch should not be first');
  });

  it('caps the day at 15 spots plus lunch', () => {
    const spots = Array.from({ length: 40 }, (_, i) => spot(`s${i}`, 0, 0.001 * (i + 1)));
    const stops = generateOptimizedItinerary(0, 0, spots, [restaurant('food', 0, 0.001)], {
      includeMeals: true,
    });
    const spotCount = stops.filter((s) => s.category !== 'restaurant').length;
    assert.equal(spotCount, 15);
    assert.equal(stops.length, 16);
  });

  it('stops scheduling new stops after 9pm', () => {
    // ~20 km hops add ~60 min travel each, pushing past 9pm before 15 spots.
    const spots = Array.from({ length: 20 }, (_, i) => spot(`s${i}`, 0.2 * (i + 1), 0));
    const stops = generateOptimizedItinerary(0, 0, spots, []);
    assert.ok(stops.length < 15, `expected early cutoff, got ${stops.length}`);
    for (const stop of stops) {
      const hour = Number(stop.estimatedTime.slice(0, 2));
      assert.ok(hour < 21, `stop scheduled at ${stop.estimatedTime}`);
    }
  });

  it('excludes meal stops by default even when restaurants exist', () => {
    const spots = Array.from({ length: 8 }, (_, i) => spot(`s${i}`, 0, 0.001 * (i + 1)));
    const stops = generateOptimizedItinerary(0, 0, spots, [restaurant('food', 0, 0.001)]);
    assert.ok(stops.every((s) => s.category !== 'restaurant'));
    assert.equal(stops.length, 8);
  });

  it('skips lunch when no restaurants are available', () => {
    const spots = Array.from({ length: 8 }, (_, i) => spot(`s${i}`, 0, 0.001 * (i + 1)));
    const stops = generateOptimizedItinerary(0, 0, spots, []);
    assert.ok(stops.every((s) => s.category !== 'restaurant'));
    assert.equal(stops.length, 8);
  });

  it('skips spots closed at visit time when skipClosed is set', () => {
    // 2026-10-04 is a Sunday.
    const closed = { ...spot('weekday-only', 0, 0.001), openingHours: 'Mo-Fr 09:00-17:00' };
    const open = { ...spot('always', 0, 0.002), openingHours: 'Mo-Su 09:00-17:00' };
    const skipped = generateOptimizedItinerary(0, 0, [closed, open], [], {
      skipClosed: true,
      visitDateISO: '2026-10-04',
    });
    assert.deepEqual(
      skipped.map((s) => s.name),
      ['always'],
    );
    const kept = generateOptimizedItinerary(0, 0, [closed, open], [], {
      visitDateISO: '2026-10-04',
    });
    assert.equal(kept.length, 2);
  });

  it('splits spots across days from the hotel with lunch each day', () => {
    const spots = Array.from({ length: 10 }, (_, i) => spot(`s${i}`, 0, 0.001 * (i + 1)));
    const food = [restaurant('food1', 0, 0.001), restaurant('food2', 0, 0.002)];
    const days = generateMultiDayItinerary(0, 0, spots, food, 2, { includeMeals: true }, (i) =>
      i === 0 ? '2026-10-05' : '2026-10-06',
    );
    assert.equal(days.length, 2);
    assert.equal(days[0].stops.length, 6); // 5 spots + lunch
    assert.equal(days[1].stops.length, 6);
    assert.ok(days.every((d) => d.stops[0].estimatedTime.startsWith('09:')));
    assert.ok(days.every((d) => d.stops.some((s) => s.category === 'restaurant')));
    const lunches = days.flatMap((d) =>
      d.stops.filter((s) => s.category === 'restaurant').map((s) => s.id),
    );
    assert.equal(new Set(lunches).size, 2); // distinct restaurant per day
  });

  it('layover trips fit the return leg before the deadline', () => {
    // Start 09:00, 5h budget, 60m buffer -> 13:00 deadline with return required.
    const spots = Array.from({ length: 10 }, (_, i) => spot(`s${i}`, 0.01 * (i + 1), 0));
    const stops = generateOptimizedItinerary(0, 0, spots, [], {
      startMinutes: 9 * 60,
      deadlineMinutes: 13 * 60,
      returnToStart: true,
    });
    assert.ok(stops.length > 0 && stops.length < 10);
    for (const stop of stops) {
      const [h, m] = stop.estimatedTime.split(':').map(Number);
      assert.ok(h * 60 + m < 13 * 60, `stop past deadline: ${stop.estimatedTime}`);
    }
  });

  it('retimeRoute keeps user order and recomputes times', () => {
    const stops = retimeRoute(0, 0, [spot('b', 0, 0.02), spot('a', 0, 0.01)], {
      startMinutes: 10 * 60,
    });
    assert.deepEqual(
      stops.map((s) => s.name),
      ['b', 'a'],
    );
    assert.deepEqual(
      stops.map((s) => s.stepOrder),
      [1, 2],
    );
    assert.ok(stops[0].estimatedTime < stops[1].estimatedTime);
    assert.ok(stops[0].estimatedTime.startsWith('10:'));
  });
});
