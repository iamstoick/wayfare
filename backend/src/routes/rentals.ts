import { Router } from 'express';
import {
  fetchNearbyRentals,
  estimateRentalRates,
  type RentalTypeFilter,
} from '../services/rentalService';
import { getPlaceTimezone, nowWallDate, isOpenAt } from '../services/openingHours';
import { getDistanceKm } from '../utils/haversine';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

const TYPES: RentalTypeFilter[] = ['all', 'car', 'motorcycle'];

// GET /api/rentals?lat=..&lng=..&radiusKm=5&type=all|car|motorcycle
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 5);
    const type = typeof req.query.type === 'string' ? req.query.type : 'all';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'lat and lng query params are required' });
      return;
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      res.status(400).json({ error: 'radiusKm must be between 0 and 50' });
      return;
    }
    if (!(TYPES as string[]).includes(type)) {
      res.status(400).json({ error: 'type must be one of all, car, motorcycle' });
      return;
    }

    try {
      const rentals = await fetchNearbyRentals(
        lat,
        lng,
        Math.round(radiusKm * 1000),
        type as RentalTypeFilter,
      );
      const tz = getPlaceTimezone(lat, lng);
      const nowWall = nowWallDate(tz);
      const withDistance = rentals
        .map((r) => ({
          ...r,
          distanceKm: Math.round(getDistanceKm(lat, lng, r.lat, r.lng) * 10) / 10,
          openNow: isOpenAt(r.openingHours, nowWall),
          estimates: estimateRentalRates(r.vehicleTypes),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm);

      res.json({ rentals: withDistance });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  }),
);

export default router;
