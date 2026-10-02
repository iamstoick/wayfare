import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getToken, type Trip, type TripMode } from '../services/api';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { useAuth } from '../hooks/useAuth';

const LIST_CACHE_KEY = 'spothop_trips_cache';
const tripCacheKey = (id: string) => `spothop_trip_${id}`;

function loadCachedList(): Trip[] {
  try {
    return JSON.parse(localStorage.getItem(LIST_CACHE_KEY) ?? '[]') as Trip[];
  } catch {
    return [];
  }
}

function loadCachedTrip(id: string): Trip | null {
  try {
    const raw = localStorage.getItem(tripCacheKey(id));
    return raw ? (JSON.parse(raw) as Trip) : null;
  } catch {
    return null;
  }
}

const MODE_LABELS: Record<TripMode, string> = {
  day: 'Day trip',
  multi: 'Multi-day',
  layover: 'Layover',
};

function tripMeta(trip: Trip): string {
  const parts = [MODE_LABELS[trip.mode] ?? 'Trip'];
  const count = trip._count?.items ?? trip.items?.length ?? 0;
  parts.push(`${count} stops`);
  if (trip.mode === 'multi' && trip.numDays > 1) parts.push(`${trip.numDays} days`);
  if (trip.startDate) parts.push(new Date(trip.startDate).toLocaleDateString());
  return parts.join(' · ');
}

export const TripsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [savedOffline, setSavedOffline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!getToken()) return;
    setLoading(true);
    api
      .listTrips()
      .then(({ trips }) => {
        setTrips(trips);
        setOffline(false);
        localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(trips));
      })
      .catch((err: Error) => {
        const cached = loadCachedList();
        if (cached.length > 0) {
          setTrips(cached);
          setOffline(true);
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this trip?')) return;
    try {
      await api.deleteTrip(id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
      localStorage.removeItem(tripCacheKey(id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleView = async (id: string) => {
    try {
      const { trip } = await api.getTrip(id);
      localStorage.setItem(tripCacheKey(id), JSON.stringify(trip));
      navigate('/', { state: { trip } });
    } catch (err) {
      const cached = loadCachedTrip(id);
      if (cached) {
        navigate('/', { state: { trip: cached } });
      } else {
        setError((err as Error).message);
      }
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const { trip } = await api.getTrip(id);
      localStorage.setItem(tripCacheKey(id), JSON.stringify(trip));
      setSavedOffline((prev) => new Set(prev).add(id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!getToken()) {
    return (
      <main className="page">
        <h1>My Trips</h1>
        <p className="empty-note">Sign in to see your saved itineraries.</p>
        <GoogleSignIn />
      </main>
    );
  }

  return (
    <main className="page">
      <h1>My Trips</h1>
      {offline && (
        <p className="offline-banner">
          You&apos;re offline — showing your last synced trips.
        </p>
      )}
      {loading && <p className="empty-note">Loading trips…</p>}
      {error && <p className="error-note">{error}</p>}
      {!loading && trips.length === 0 && (
        <p className="empty-note">
          No saved trips yet. <Link to="/">Plan your first itinerary</Link>.
        </p>
      )}
      <ul className="trips-list">
        {trips.map((trip) => (
          <li key={trip.id} className="trip-card">
            <div>
              <strong>{trip.title}</strong>
              <div className="place-meta">
                <span>{tripMeta(trip)}</span>
              </div>
            </div>
            <div className="trip-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleView(trip.id)}>
                View on map
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleDownload(trip.id)}
                title="Keep this trip available offline"
              >
                {savedOffline.has(trip.id) || loadCachedTrip(trip.id) ? 'Saved offline' : 'Download'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => handleDelete(trip.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
};
