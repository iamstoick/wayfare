import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';
import authRoutes from './routes/auth';
import placesRoutes from './routes/places';
import geocodeRoutes from './routes/geocode';
import itineraryRoutes from './routes/itineraries';

const app = express();
const PORT = Number(process.env.PORT ?? 5001);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/itineraries', itineraryRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Must be last: turns handler rejections into 500s instead of crashes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`SpotHop API listening on :${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
