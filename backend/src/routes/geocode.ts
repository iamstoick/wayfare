import { Router } from 'express';
import { searchLocations } from '../services/nominatimService';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

// GET /api/geocode?q=manila
router.get('/', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.status(400).json({ error: 'q query param is required' });
    return;
  }

  try {
    const results = await searchLocations(q);
    res.json({ results });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
}));

export default router;
