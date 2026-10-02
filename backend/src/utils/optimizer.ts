import { getDistanceKm, formatClock } from './haversine';
import { isOpenAt, visitWallDate } from '../services/openingHours';

export type Pace = 'relaxed' | 'standard' | 'packed';
export type TransportMode = 'walk' | 'bike' | 'transit' | 'drive';

export const PACE_VISIT_MINUTES: Record<Pace, number> = {
  relaxed: 60,
  standard: 45,
  packed: 30,
};

export const TRANSPORT_SPEED_KMH: Record<TransportMode, number> = {
  walk: 5,
  bike: 15,
  transit: 20,
  drive: 35,
};

export const TRANSPORT_OSRM_PROFILE: Record<TransportMode, 'foot' | 'bike' | 'driving'> = {
  walk: 'foot',
  bike: 'bike',
  transit: 'driving',
  drive: 'driving',
};

export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  isFree: boolean;
  openingHours?: string;
}

export interface ItineraryStop extends Location {
  stepOrder: number;
  estimatedTime: string;
}

export interface DayPlan {
  dayIndex: number;
  dateISO: string | null;
  stops: ItineraryStop[];
}

export interface ScheduleOptions {
  pace?: Pace;
  transport?: TransportMode;
  startMinutes?: number;
  dayEndMinutes?: number;
  includeMeals?: boolean;
  skipClosed?: boolean;
  visitDateISO?: string;
  maxSpots?: number;
  deadlineMinutes?: number;
  returnToStart?: boolean;
}

const TRIP_START_MINUTES = 9 * 60;
const LUNCH_FROM_MINUTES = 12 * 60;
const LUNCH_UNTIL_MINUTES = 14 * 60;
const LUNCH_DURATION_MINUTES = 60;
const DAY_END_MINUTES = 21 * 60;
const MAX_SPOTS = 15;

interface Candidate {
  place: Location;
  idx: number;
  travel: number;
}

export function scheduleDay(
  startLat: number,
  startLng: number,
  spots: Location[],
  restaurants: Location[],
  options: ScheduleOptions = {},
): ItineraryStop[] {
  const {
    pace = 'standard',
    transport = 'transit',
    startMinutes = TRIP_START_MINUTES,
    dayEndMinutes = DAY_END_MINUTES,
    includeMeals = false,
    skipClosed = false,
    visitDateISO,
    maxSpots = MAX_SPOTS,
    deadlineMinutes,
    returnToStart = false,
  } = options;

  const visitMin = PACE_VISIT_MINUTES[pace];
  const speedKmh = TRANSPORT_SPEED_KMH[transport];
  const end = Math.min(dayEndMinutes, deadlineMinutes ?? Infinity);

  const travelBetween = (aLat: number, aLng: number, bLat: number, bLng: number): number =>
    Math.round((getDistanceKm(aLat, aLng, bLat, bLng) / speedKmh) * 60);

  const unvisited = [...spots];
  const food = [...restaurants];
  const itinerary: ItineraryStop[] = [];

  let currentLat = startLat;
  let currentLng = startLng;
  let currentTimeMinutes = startMinutes;
  let step = 1;
  let lunchAdded = false;
  let spotsAdded = 0;

  const openAtArrival = (place: Location, arrival: number): boolean => {
    if (!skipClosed || !visitDateISO) return true;
    return isOpenAt(place.openingHours, visitWallDate(visitDateISO, 0, arrival)) !== false;
  };

  const fitsReturn = (place: Location, arrival: number, stayMin: number): boolean => {
    if (!returnToStart || deadlineMinutes === undefined) return true;
    const back = travelBetween(place.lat, place.lng, startLat, startLng);
    return arrival + stayMin + back <= deadlineMinutes;
  };

  // Nearest-first candidates satisfying arrival, open-hours, and return-fit.
  const candidates = (list: Location[], stayMin: number): Candidate[] =>
    list
      .map((place, idx) => ({
        place,
        idx,
        travel: travelBetween(currentLat, currentLng, place.lat, place.lng),
      }))
      .filter((c) => currentTimeMinutes + c.travel < end)
      .filter((c) => openAtArrival(c.place, currentTimeMinutes + c.travel))
      .filter((c) => fitsReturn(c.place, currentTimeMinutes + c.travel, stayMin))
      .sort((a, b) => a.travel - b.travel);

  while (unvisited.length > 0 && spotsAdded < maxSpots && currentTimeMinutes < end) {
    // Midday meal window: inject the nearest fitting restaurant.
    if (
      includeMeals &&
      !lunchAdded &&
      currentTimeMinutes >= LUNCH_FROM_MINUTES &&
      currentTimeMinutes <= LUNCH_UNTIL_MINUTES &&
      food.length > 0
    ) {
      const pick = candidates(food, LUNCH_DURATION_MINUTES)[0];
      if (pick) {
        food.splice(pick.idx, 1);
        currentTimeMinutes += pick.travel;
        itinerary.push({
          ...pick.place,
          stepOrder: step++,
          estimatedTime: `${formatClock(currentTimeMinutes)} (Meal Stop)`,
        });
        currentLat = pick.place.lat;
        currentLng = pick.place.lng;
        currentTimeMinutes += LUNCH_DURATION_MINUTES;
        lunchAdded = true;
        continue;
      }
    }

    const pick = candidates(unvisited, visitMin)[0];
    if (!pick) break;

    unvisited.splice(pick.idx, 1);
    currentTimeMinutes += pick.travel;
    itinerary.push({
      ...pick.place,
      stepOrder: step++,
      estimatedTime: formatClock(currentTimeMinutes),
    });
    currentLat = pick.place.lat;
    currentLng = pick.place.lng;
    currentTimeMinutes += visitMin;
    spotsAdded++;
  }

  return itinerary;
}

// Backward-compatible single-day entry point.
export function generateOptimizedItinerary(
  startLat: number,
  startLng: number,
  spots: Location[],
  restaurants: Location[],
  options: ScheduleOptions = {},
): ItineraryStop[] {
  return scheduleDay(startLat, startLng, spots, restaurants, options);
}

export function generateMultiDayItinerary(
  hotelLat: number,
  hotelLng: number,
  spots: Location[],
  restaurants: Location[],
  numDays: number,
  options: ScheduleOptions,
  dayDateISO: (dayIndex: number) => string | null,
): DayPlan[] {
  // Order every spot into one nearest-neighbor chain from the hotel,
  // then split into contiguous balanced day chunks.
  const chain: Location[] = [];
  const remaining = [...spots];
  let lat = hotelLat;
  let lng = hotelLng;
  while (remaining.length > 0) {
    let best = 0;
    let bestDist = Infinity;
    remaining.forEach((spot, idx) => {
      const dist = getDistanceKm(lat, lng, spot.lat, spot.lng);
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    });
    const [next] = remaining.splice(best, 1);
    chain.push(next);
    lat = next.lat;
    lng = next.lng;
  }

  const days: DayPlan[] = [];
  const foodPool = [...restaurants];
  const perDay = Math.ceil(chain.length / Math.max(1, numDays));
  for (let dayIndex = 0; dayIndex < numDays; dayIndex++) {
    const chunk = chain.slice(dayIndex * perDay, (dayIndex + 1) * perDay);
    const dateISO = dayDateISO(dayIndex);
    const stops = scheduleDay(hotelLat, hotelLng, chunk, foodPool, {
      ...options,
      visitDateISO: dateISO ?? options.visitDateISO,
    });
    const usedMeals = new Set(
      stops.filter((s) => s.category === 'restaurant').map((s) => s.id),
    );
    for (let i = foodPool.length - 1; i >= 0; i--) {
      if (usedMeals.has(foodPool[i].id)) foodPool.splice(i, 1);
    }
    days.push({ dayIndex: dayIndex + 1, dateISO, stops });
  }
  return days;
}

// Recompute times + order for a user-arranged stop list (drag-reorder).
// Keeps every stop; no selection, no lunch insertion, no day-end cutoff.
export function retimeRoute(
  startLat: number,
  startLng: number,
  stops: Location[],
  options: Pick<ScheduleOptions, 'pace' | 'transport' | 'startMinutes'> = {},
): ItineraryStop[] {
  const { pace = 'standard', transport = 'transit', startMinutes = TRIP_START_MINUTES } = options;
  const visitMin = PACE_VISIT_MINUTES[pace];
  const speedKmh = TRANSPORT_SPEED_KMH[transport];

  let currentLat = startLat;
  let currentLng = startLng;
  let currentTimeMinutes = startMinutes;

  return stops.map((stop, i) => {
    currentTimeMinutes += Math.round(
      (getDistanceKm(currentLat, currentLng, stop.lat, stop.lng) / speedKmh) * 60,
    );
    currentLat = stop.lat;
    currentLng = stop.lng;
    const estimatedTime =
      stop.category === 'restaurant'
        ? `${formatClock(currentTimeMinutes)} (Meal Stop)`
        : formatClock(currentTimeMinutes);
    currentTimeMinutes += stop.category === 'restaurant' ? LUNCH_DURATION_MINUTES : visitMin;
    return { ...stop, stepOrder: i + 1, estimatedTime };
  });
}
