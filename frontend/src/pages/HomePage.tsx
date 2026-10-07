import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MapView } from '../components/MapView';
import { SearchBar } from '../components/SearchBar';
import { FilterBar } from '../components/FilterBar';
import { TripSettingsForm, defaultSettings, type TripSettings } from '../components/TripSettings';
import { PlacesList } from '../components/PlacesList';
import { RentalsList } from '../components/RentalsList';
import { ItineraryPanel } from '../components/ItineraryPanel';
import {
  api,
  type DayPlan,
  type GeocodeHit,
  type Hotel,
  type ItineraryStop,
  type Place,
  type Rental,
  type RentalTypeFilter,
  type Trip,
} from '../services/api';

interface Pin {
  lat: number;
  lng: number;
}

interface LocationState {
  trip?: Trip;
}

type Tab = 'places' | 'rentals' | 'itinerary';

const VEHICLE_FILTERS: Array<{ value: RentalTypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'car', label: 'Car' },
  { value: 'motorcycle', label: 'Motorcycle' },
];

export const HomePage: React.FC = () => {
  const location = useLocation();
  const [pin, setPin] = useState<Pin | null>(null);
  const [radiusKm, setRadiusKm] = useState(3);
  const [freeOnly, setFreeOnly] = useState(false);
  const [settings, setSettings] = useState<TripSettings>(defaultSettings);
  const [places, setPlaces] = useState<Place[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [vehicleFilter, setVehicleFilter] = useState<RentalTypeFilter>('all');
  const [days, setDays] = useState<DayPlan[]>([]);
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [returnBy, setReturnBy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('places');
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [loadingRentals, setLoadingRentals] = useState(false);
  const [rentalsError, setRentalsError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [addingMeals, setAddingMeals] = useState(false);
  const [retimingDay, setRetimingDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const loadPlaces = useCallback(async (target: Pin, radius: number, free: boolean) => {
    setLoadingPlaces(true);
    setError(null);
    try {
      const { places } = await api.getPlaces(target.lat, target.lng, radius, free);
      setPlaces(places);
    } catch (err) {
      setError((err as Error).message);
      setPlaces([]);
    } finally {
      setLoadingPlaces(false);
    }
  }, []);

  const loadRentals = useCallback(async (target: Pin, radius: number) => {
    setLoadingRentals(true);
    setRentalsError(null);
    try {
      const { rentals } = await api.getRentals(target.lat, target.lng, radius);
      setRentals(rentals);
    } catch (err) {
      setRentalsError((err as Error).message);
      setRentals([]);
    } finally {
      setLoadingRentals(false);
    }
  }, []);

  // Hydrate from a saved trip opened via "View on map".
  useEffect(() => {
    const state = location.state as LocationState | null;
    const trip = state?.trip;
    if (!trip) return;
    const center = { lat: trip.centerLat, lng: trip.centerLng };
    setPin(center);
    setRadiusKm(trip.radiusKm);
    setHotel(
      trip.hotelLat !== null && trip.hotelLng !== null
        ? { lat: trip.hotelLat, lng: trip.hotelLng, name: trip.hotelName ?? undefined }
        : center,
    );
    setPlaces(
      trip.items.map((item) => ({
        osmId: item.osmId,
        name: item.name,
        lat: item.lat,
        lng: item.lng,
        category: (item.category === 'restaurant' ? 'restaurant' : 'tourist_spot') as Place['category'],
        openingHours: item.openingHours ?? 'Not specified',
        isFree: item.isFree,
        distanceKm: 0,
        openNow: null,
      })),
    );
    const grouped = new Map<number, ItineraryStop[]>();
    for (const item of trip.items) {
      const list = grouped.get(item.dayIndex) ?? [];
      list.push({
        id: item.osmId,
        name: item.name,
        lat: item.lat,
        lng: item.lng,
        category: item.category,
        isFree: item.isFree,
        stepOrder: item.orderIndex,
        estimatedTime: item.visitTime ?? '',
        openingHours: item.openingHours ?? undefined,
      });
      grouped.set(item.dayIndex, list);
    }
    setDays(
      [...grouped.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([dayIndex, stops]) => ({ dayIndex, dateISO: null, stops, geometry: null })),
    );
    setReturnBy(null);
    setTab('itinerary');
    window.history.replaceState({}, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetPlan = () => {
    setDays([]);
    setHotel(null);
    setReturnBy(null);
    setTab('places');
  };

  const handlePinSelect = (lat: number, lng: number) => {
    const next = { lat, lng };
    setPin(next);
    resetPlan();
    void loadPlaces(next, radiusKm, freeOnly);
    void loadRentals(next, radiusKm);
  };

  const handleSearchSelect = (hit: GeocodeHit) => handlePinSelect(hit.lat, hit.lng);

  const handleRadiusChange = (km: number) => {
    setRadiusKm(km);
    if (pin) {
      void loadPlaces(pin, km, freeOnly);
      void loadRentals(pin, km);
    }
  };

  const handleFreeOnlyChange = (value: boolean) => {
    setFreeOnly(value);
    if (pin) void loadPlaces(pin, radiusKm, value);
  };

  const runGenerate = async (includeMeals: boolean) => {
    if (!pin) return;
    const { days, returnBy, hotel } = await api.generate({
      lat: pin.lat,
      lng: pin.lng,
      radiusKm,
      freeOnly,
      includeMeals,
      mode: settings.mode,
      numDays: settings.numDays,
      startTime: settings.startTime,
      startDate: settings.startDate || undefined,
      pace: settings.pace,
      transport: settings.transport,
      skipClosed: settings.skipClosed,
      budgetMinutes: settings.budgetHours * 60,
      bufferMinutes: settings.bufferMinutes,
    });
    setDays(days);
    setHotel(hotel);
    setReturnBy(returnBy ?? null);
  };

  const handleGenerate = async () => {
    if (!pin) return;
    setGenerating(true);
    setError(null);
    try {
      await runGenerate(false);
      setTab('itinerary');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAddMeals = async () => {
    if (!pin) return;
    setAddingMeals(true);
    setError(null);
    try {
      await runGenerate(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingMeals(false);
    }
  };

  const handleReorder = async (dayIndex: number, stops: ItineraryStop[]) => {
    const base = hotel || pin;
    if (!base) return;
    // Optimistic: show the new order immediately, then refresh times.
    setDays((prev) => prev.map((d) => (d.dayIndex === dayIndex ? { ...d, stops } : d)));
    setRetimingDay(dayIndex);
    try {
      const { stops: timed, geometry } = await api.retime({
        startLat: base.lat,
        startLng: base.lng,
        stops,
        pace: settings.pace,
        transport: settings.transport,
        startTime: settings.startTime,
      });
      setDays((prev) =>
        prev.map((d) => (d.dayIndex === dayIndex ? { ...d, stops: timed, geometry } : d)),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRetimingDay(null);
    }
  };

  const handleSave = async (title: string) => {
    if (!pin) return;
    setSaving(true);
    try {
      await api.saveTrip({
        title,
        centerLat: pin.lat,
        centerLng: pin.lng,
        radiusKm,
        mode: settings.mode,
        numDays: days.length || 1,
        startDate: days[0]?.dateISO ?? undefined,
        hotelLat: hotel?.lat,
        hotelLng: hotel?.lng,
        hotelName: hotel?.name,
        items: days.flatMap((day) =>
          day.stops.map((stop) => ({
            osmId: stop.id,
            name: stop.name,
            category: stop.category,
            lat: stop.lat,
            lng: stop.lng,
            openingHours: stop.openingHours,
            isFree: stop.isFree,
            orderIndex: stop.stepOrder,
            visitTime: stop.estimatedTime,
            dayIndex: day.dayIndex,
          })),
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const spots = places.filter((p) => p.category === 'tourist_spot').length;
  const food = places.filter((p) => p.category === 'restaurant').length;
  const totalStops = days.reduce((n, d) => n + d.stops.length, 0);
  const visibleRentals =
    vehicleFilter === 'all' ? rentals : rentals.filter((r) => r.vehicleTypes.includes(vehicleFilter));

  return (
    <main className="layout">
      <aside className="sidebar">
        {!online && (
          <p className="offline-banner">
            You&apos;re offline. Planning needs a connection — saved trips remain available.
          </p>
        )}
        <SearchBar onSelect={handleSearchSelect} />
        <p className="hint">…or tap anywhere on the map to drop a pin.</p>
        <FilterBar
          radiusKm={radiusKm}
          onRadiusChange={handleRadiusChange}
          freeOnly={freeOnly}
          onFreeOnlyChange={handleFreeOnlyChange}
        />
        <TripSettingsForm settings={settings} onChange={setSettings} />

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={handleGenerate}
          disabled={!pin || generating || loadingPlaces}
        >
          {generating ? 'Generating…' : 'Generate itinerary'}
        </button>

        {error && <p className="error-note">{error}</p>}

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'places'}
            className={tab === 'places' ? 'tab active' : 'tab'}
            onClick={() => setTab('places')}
          >
            Places {places.length > 0 && `(${places.length})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'rentals'}
            className={tab === 'rentals' ? 'tab active' : 'tab'}
            onClick={() => setTab('rentals')}
          >
            Rentals {rentals.length > 0 && `(${rentals.length})`}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'itinerary'}
            className={tab === 'itinerary' ? 'tab active' : 'tab'}
            onClick={() => setTab('itinerary')}
          >
            Itinerary {totalStops > 0 && `(${totalStops})`}
          </button>
        </div>

        {tab === 'places' ? (
          <>
            {loadingPlaces && <p className="empty-note">Loading nearby places…</p>}
            {!loadingPlaces && places.length > 0 && (
              <p className="result-meta">
                {spots} spots · {food} food stops within {radiusKm} km
              </p>
            )}
            {!loadingPlaces && <PlacesList places={places} />}
          </>
        ) : tab === 'rentals' ? (
          <>
            <div className="segmented" role="tablist" aria-label="Vehicle type">
              {VEHICLE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={vehicleFilter === f.value}
                  className={vehicleFilter === f.value ? 'segment active' : 'segment'}
                  onClick={() => setVehicleFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {loadingRentals && <p className="empty-note">Loading nearby rentals…</p>}
            {!loadingRentals && rentalsError && <p className="error-note">{rentalsError}</p>}
            {!loadingRentals && !rentalsError && visibleRentals.length > 0 && (
              <p className="result-meta">
                {visibleRentals.length} rentals within {radiusKm} km
              </p>
            )}
            {!loadingRentals && !rentalsError && <RentalsList rentals={visibleRentals} />}
          </>
        ) : (
          <ItineraryPanel
            days={days}
            returnBy={returnBy}
            onSave={handleSave}
            saving={saving}
            onAddMeals={handleAddMeals}
            addingMeals={addingMeals}
            onReorder={handleReorder}
            retimingDay={retimingDay}
          />
        )}
      </aside>

      <section className="map-pane">
        <MapView
          pinnedLocation={pin}
          onPinSelect={handlePinSelect}
          places={places}
          days={days}
          hotel={hotel}
          rentals={rentals}
        />
      </section>
    </main>
  );
};
