# SpotHop — Smart Travel Itinerary (Wayfare)

Pin a location, discover nearby tourist spots and restaurants from
OpenStreetMap, and generate an optimized timed itinerary. Sign in with Google
to save trips. Installable as a PWA for use on trips.

## Features

- **Day trip / multi-day / layover modes** — single-day plans, 2–7 day trips
  from a hotel base, or time-boxed layovers that guarantee return with buffer.
- **Smart scheduling** — pace (relaxed/standard/packed), transport mode
  (foot/bike/transit/drive), custom start time and date, and optional
  skipping of places closed at visit time (opening hours evaluated in the
  place's own timezone).
- **Two-step meals** — itineraries generate spots-first; one click adds
  midday restaurant stops.
- **Drag-to-reorder** — rearrange any day's stops; times and route geometry
  recompute live.
- **Richer places** — open-now badges plus lazy-loaded Wikipedia summaries
  and photos.
- **Offline-friendly** — viewed map tiles are cached; saved trips can be
  downloaded for offline viewing.

## Stack

- **Web:** React 19 + Vite + Leaflet + vite-plugin-pwa (served by nginx)
- **API:** Express 4 + TypeScript + Prisma 5 + JWT sessions
- **DB:** PostgreSQL 15 + PostGIS
- **Data (free, open source):** Nominatim (geocoding), Overpass API (places,
  opening hours, entrance fees), OSRM (route geometry)

## Quick start

Prereqs: Docker + Docker Compose.

```bash
cp .env.example .env   # set JWT_SECRET + GOOGLE_CLIENT_ID
docker compose up --build
```

Open [http://localhost:4445](http://localhost:4445) in your browser.
API health: [http://localhost:5001/api/health](http://localhost:5001/api/health).

Google sign-in needs a Client ID from the
[Google Cloud Console](https://console.cloud.google.com/) (APIs & Services →
Credentials → Create OAuth client ID, type Web). Without it, planning and
itinerary generation work; only saving trips is disabled.

## Local development (without Docker)

```bash
# Terminal 1 — database
docker compose up db

# Terminal 2 — API (http://localhost:5001)
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm test        # optimizer unit tests
npm run dev

# Terminal 3 — web (http://localhost:5173)
cd frontend
cp .env.example .env
npm install
npm run dev
```

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | – | Liveness probe |
| GET | `/api/geocode?q=` | – | Nominatim place search |
| GET | `/api/places?lat&lng&radiusKm&freeOnly` | – | Nearby spots + food (with `openNow`) |
| GET | `/api/places/enrich?lat&lng&name` | – | Wikipedia summary + thumbnail |
| POST | `/api/itineraries/generate` | – | Day/multi-day/layover route; `includeMeals` adds lunch stops |
| POST | `/api/itineraries/retime` | – | Recompute times + geometry for a user order |
| POST | `/api/auth/google` | – | GIS idToken → JWT |
| GET/POST | `/api/itineraries` | JWT | List / save trips |
| GET/DELETE | `/api/itineraries/:id` | JWT | Trip detail / delete |

## Project layout

```text
.
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts
│       ├── routes/      # auth, places, geocode, itineraries
│       ├── services/    # overpass, nominatim, osrm
│       ├── middleware/  # JWT auth
│       ├── utils/       # optimizer, haversine
│       └── lib/         # prisma client
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── vite.config.ts   # + PWA manifest
    └── src/
        ├── components/  # MapView, SearchBar, FilterBar, PlacesList, ...
        ├── pages/       # HomePage, TripsPage
        ├── hooks/       # useAuth
        └── services/    # typed API client
```

## Notes

- Respect upstream usage policies: Nominatim (≤1 req/s, identifying
  User-Agent — the API proxy sets one), Overpass, and the OSRM demo server
  (route geometry is best-effort with straight-line fallback).
- Coordinates are stored as floats; PostGIS is enabled per the plan for
  future geospatial queries, while routing math uses Haversine.
