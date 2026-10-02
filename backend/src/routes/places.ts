import { Router } from 'express';
import { fetchNearbyPlaces } from '../services/overpassService';
import { enrichPlace } from '../services/wikimediaService';
import { getPlaceTimezone, nowWallDate, isOpenAt } from '../services/openingHours';
import { getDistanceKm } from '../utils/haversine';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

// GET /api/places/enrich?lat=..&lng=..&name=..
router.get(
  '/enrich',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const name = typeof req.query.name === 'string' ? req.query.name : '';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'lat and lng query params are required' });
      return;
    }

    const enrichment = await enrichPlace(lat, lng, name);
    res.json({ enrichment });
  }),
);

// GET /api/places?lat=..&lng=..&radiusKm=3&freeOnly=false
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm ?? 3);
    const freeOnly = req.query.freeOnly === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'lat and lng query params are required' });
      return;
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
      res.status(400).json({ error: 'radiusKm must be between 0 and 50' });
      return;
    }

    try {
      const places = await fetchNearbyPlaces(lat, lng, Math.round(radiusKm * 1000));
      const tz = getPlaceTimezone(lat, lng);
      const nowWall = nowWallDate(tz);
      const withDistance = places
        .filter((p) => !freeOnly || p.category === 'restaurant' || p.isFree)
        .map((p) => ({
          ...p,
          distanceKm: Math.round(getDistanceKm(lat, lng, p.lat, p.lng) * 10) / 10,
          openNow: isOpenAt(p.openingHours, nowWall),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm);

      res.json({ places: withDistance });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  }),
);

export default router;
