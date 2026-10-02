import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { fetchNearbyPlaces } from '../services/overpassService';
import { fetchRouteGeometry } from '../services/osrmService';
import { getPlaceTimezone, todayInZone, addDaysISO } from '../services/openingHours';
import {
  scheduleDay,
  generateMultiDayItinerary,
  retimeRoute,
  TRANSPORT_OSRM_PROFILE,
  type Location,
  type Pace,
  type TransportMode,
} from '../utils/optimizer';
import { formatClock } from '../utils/haversine';

const router = Router();

type TripMode = 'day' | 'multi' | 'layover';

const MODES: TripMode[] = ['day', 'multi', 'layover'];
const PACES: Pace[] = ['relaxed', 'standard', 'packed'];
const TRANSPORTS: TransportMode[] = ['walk', 'bike', 'transit', 'drive'];

interface GenerateBody {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  freeOnly?: boolean;
  includeMeals?: boolean;
  mode?: TripMode;
  numDays?: number;
  startTime?: string; // "HH:MM"
  startDate?: string; // "YYYY-MM-DD"
  pace?: Pace;
  transport?: TransportMode;
  skipClosed?: boolean;
  budgetMinutes?: number; // layover: total time available
  bufferMinutes?: number; // layover: safety margin before the end
  hotel?: { lat?: number; lng?: number; name?: string };
}

function parseStartTime(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

function isDateISO(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

// POST /api/itineraries/generate — public day/multi-day/layover planner.
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const body = req.body as GenerateBody;
    const {
      lat,
      lng,
      radiusKm = 3,
      freeOnly = false,
      includeMeals = false,
      mode = 'day',
      numDays = 1,
      pace = 'standard',
      transport = 'transit',
      skipClosed = false,
      budgetMinutes = 300,
      bufferMinutes = 60,
    } = body;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'lat and lng are required' });
      return;
    }
    if (!Number.isFinite(radiusKm) || (radiusKm as number) <= 0 || (radiusKm as number) > 50) {
      res.status(400).json({ error: 'radiusKm must be between 0 and 50' });
      return;
    }
    if (!MODES.includes(mode)) {
      res.status(400).json({ error: 'mode must be day, multi, or layover' });
      return;
    }
    if (!PACES.includes(pace) || !TRANSPORTS.includes(transport)) {
      res.status(400).json({ error: 'invalid pace or transport' });
      return;
    }
    const startMinutes = parseStartTime(body.startTime, 9 * 60);
    if (startMinutes === null) {
      res.status(400).json({ error: 'startTime must be HH:MM' });
      return;
    }
    if (body.startDate !== undefined && !isDateISO(body.startDate)) {
      res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
      return;
    }
    const hotel = {
      lat: Number(body.hotel?.lat ?? lat),
      lng: Number(body.hotel?.lng ?? lng),
      name: body.hotel?.name,
    };
    if (!Number.isFinite(hotel.lat) || !Number.isFinite(hotel.lng)) {
      res.status(400).json({ error: 'hotel lat/lng must be numbers' });
      return;
    }

    try {
      const places = await fetchNearbyPlaces(
        lat as number,
        lng as number,
        Math.round((radiusKm as number) * 1000),
      );
      const toLocation = (p: (typeof places)[number]): Location => ({
        id: p.osmId,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        category: p.category,
        isFree: p.isFree,
        openingHours: p.openingHours,
      });
      const spots = places
        .filter((p) => p.category === 'tourist_spot' && (!freeOnly || p.isFree))
        .map(toLocation);
      const restaurants = places.filter((p) => p.category === 'restaurant').map(toLocation);

      const tz = getPlaceTimezone(lat as number, lng as number);
      const baseDate = body.startDate?.trim() || todayInZone(tz);
      const profile = TRANSPORT_OSRM_PROFILE[transport];

      if (mode === 'layover') {
        if (
          !Number.isFinite(budgetMinutes) ||
          (budgetMinutes as number) < 60 ||
          (budgetMinutes as number) > 1440
        ) {
          res.status(400).json({ error: 'budgetMinutes must be between 60 and 1440' });
          return;
        }
        const deadline = startMinutes + (budgetMinutes as number) - (bufferMinutes as number);
        const stops = scheduleDay(hotel.lat, hotel.lng, spots, restaurants, {
          pace,
          transport,
          startMinutes,
          includeMeals,
          skipClosed,
          visitDateISO: baseDate,
          deadlineMinutes: deadline,
          returnToStart: true,
        });
        const loop = [{ lat: hotel.lat, lng: hotel.lng }, ...stops, { lat: hotel.lat, lng: hotel.lng }];
        const geometry = await fetchRouteGeometry(loop, profile);
        res.json({
          days: [{ dayIndex: 1, dateISO: baseDate, stops, geometry }],
          returnBy: formatClock(deadline),
          summary: { totalStops: stops.length, totalDays: 1 },
          hotel,
        });
        return;
      }

      const days = mode === 'multi' ? Math.min(7, Math.max(2, Math.floor(numDays as number) || 2)) : 1;
      const plans = generateMultiDayItinerary(hotel.lat, hotel.lng, spots, restaurants, days, {
        pace,
        transport,
        startMinutes,
        includeMeals,
        skipClosed,
      }, (dayIndex) => addDaysISO(baseDate, dayIndex));

      const withGeometry = await Promise.all(
        plans.map(async (plan) => ({
          ...plan,
          geometry: await fetchRouteGeometry(
            [{ lat: hotel.lat, lng: hotel.lng }, ...plan.stops],
            profile,
          ),
        })),
      );

      res.json({
        days: withGeometry,
        summary: {
          totalStops: withGeometry.reduce((n, d) => n + d.stops.length, 0),
          totalDays: withGeometry.length,
        },
        hotel,
      });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  }),
);

interface ReorderBody {
  startLat?: number;
  startLng?: number;
  stops?: Location[];
  pace?: Pace;
  transport?: TransportMode;
  startTime?: string;
}

// POST /api/itineraries/retime — recompute times + geometry for a user order.
router.post(
  '/retime',
  asyncHandler(async (req, res) => {
    const body = req.body as ReorderBody;
    const { startLat, startLng, stops, pace = 'standard', transport = 'transit' } = body;

    if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
      res.status(400).json({ error: 'startLat and startLng are required' });
      return;
    }
    if (!Array.isArray(stops) || stops.length === 0) {
      res.status(400).json({ error: 'stops must be a non-empty array' });
      return;
    }
    if (!PACES.includes(pace) || !TRANSPORTS.includes(transport)) {
      res.status(400).json({ error: 'invalid pace or transport' });
      return;
    }
    const startMinutes = parseStartTime(body.startTime, 9 * 60);
    if (startMinutes === null) {
      res.status(400).json({ error: 'startTime must be HH:MM' });
      return;
    }

    const timed = retimeRoute(startLat as number, startLng as number, stops, {
      pace,
      transport,
      startMinutes,
    });
    const geometry = await fetchRouteGeometry(
      [{ lat: startLat as number, lng: startLng as number }, ...timed],
      TRANSPORT_OSRM_PROFILE[transport],
    );
    res.json({ stops: timed, geometry });
  }),
);

// GET /api/itineraries — own trips, newest first.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const trips = await prisma.itinerary.findMany({
      where: { userId: req.userId! },
      include: { _count: { select: { items: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ trips });
  }),
);

interface SaveItemBody {
  osmId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address?: string;
  openingHours?: string;
  isFree?: boolean;
  orderIndex: number;
  visitTime?: string;
  dayIndex?: number;
}

interface SaveBody {
  title?: string;
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  items?: SaveItemBody[];
  mode?: TripMode;
  numDays?: number;
  startDate?: string;
  hotelLat?: number;
  hotelLng?: number;
  hotelName?: string;
}

// POST /api/itineraries — save a generated trip.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { title, centerLat, centerLng, radiusKm, items } = req.body as SaveBody;
    const save = req.body as SaveBody;

    if (!title?.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng) || !Number.isFinite(radiusKm)) {
      res.status(400).json({ error: 'centerLat, centerLng and radiusKm are required' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'at least one item is required' });
      return;
    }
    if (save.mode !== undefined && !MODES.includes(save.mode)) {
      res.status(400).json({ error: 'mode must be day, multi, or layover' });
      return;
    }
    if (save.startDate !== undefined && !isDateISO(save.startDate)) {
      res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
      return;
    }

    const trip = await prisma.itinerary.create({
      data: {
        userId: req.userId!,
        title: title.trim(),
        centerLat: centerLat as number,
        centerLng: centerLng as number,
        radiusKm: radiusKm as number,
        mode: save.mode ?? 'day',
        numDays: save.numDays ?? 1,
        startDate: save.startDate ? new Date(`${save.startDate}T00:00:00Z`) : null,
        hotelLat: save.hotelLat ?? null,
        hotelLng: save.hotelLng ?? null,
        hotelName: save.hotelName ?? null,
        items: {
          create: items.map((item) => ({
            osmId: item.osmId,
            name: item.name,
            category: item.category,
            lat: item.lat,
            lng: item.lng,
            address: item.address ?? null,
            openingHours: item.openingHours ?? null,
            isFree: item.isFree ?? true,
            orderIndex: item.orderIndex,
            visitTime: item.visitTime ?? null,
            dayIndex: item.dayIndex ?? 1,
          })),
        },
      },
      include: { items: { orderBy: [{ dayIndex: 'asc' }, { orderIndex: 'asc' }] } },
    });

    res.status(201).json({ trip });
  }),
);

// GET /api/itineraries/:id — one own trip with items.
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const trip = await prisma.itinerary.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: { items: { orderBy: [{ dayIndex: 'asc' }, { orderIndex: 'asc' }] } },
    });
    if (!trip) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.json({ trip });
  }),
);

// DELETE /api/itineraries/:id
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await prisma.itinerary.deleteMany({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Trip not found' });
      return;
    }
    res.status(204).end();
  }),
);

export default router;
