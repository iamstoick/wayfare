import React, { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Place, DayPlan, Hotel } from '../services/api';

// Fix default leaflet marker icon issue in Vite.
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const DAY_COLORS = ['#2563eb', '#0d9488', '#b45309', '#be123c', '#4d7c0f', '#0369a1', '#57534e'];

interface MapViewProps {
  pinnedLocation: { lat: number; lng: number } | null;
  onPinSelect: (lat: number, lng: number) => void;
  places: Place[];
  days: DayPlan[];
  hotel: Hotel | null;
}

function LocationMarker({ onPinSelect }: { onPinSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPinSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ center }: { center: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 13));
  }, [center, map]);
  return null;
}

const dotIcon = (className: string) =>
  L.divIcon({
    className: '',
    html: `<span class="map-dot ${className}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const numberIcon = (n: number, color: string) =>
  L.divIcon({
    className: '',
    html: `<span class="map-number" style="background:${color}">${n}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

const spotIcon = dotIcon('map-dot-spot');
const restaurantIcon = dotIcon('map-dot-food');
const hotelIcon = dotIcon('map-dot-hotel');

export const MapView: React.FC<MapViewProps> = ({
  pinnedLocation,
  onPinSelect,
  places,
  days,
  hotel,
}) => {
  const center = pinnedLocation || { lat: 14.5547, lng: 121.0244 }; // Default: Manila

  const itineraryIds = new Set(days.flatMap((d) => d.stops.map((s) => s.id)));
  const base = hotel || pinnedLocation;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationMarker onPinSelect={onPinSelect} />
      <Recenter center={pinnedLocation} />

      {pinnedLocation && (
        <Marker position={[pinnedLocation.lat, pinnedLocation.lng]}>
          <Popup>Pinned starting location</Popup>
        </Marker>
      )}

      {hotel && (
        <Marker position={[hotel.lat, hotel.lng]} icon={hotelIcon}>
          <Popup>{hotel.name || 'Trip base'}</Popup>
        </Marker>
      )}

      {places
        .filter((place) => !itineraryIds.has(place.osmId))
        .map((place) => (
          <Marker
            key={place.osmId}
            position={[place.lat, place.lng]}
            icon={place.category === 'restaurant' ? restaurantIcon : spotIcon}
          >
            <Popup>
              <strong>{place.name}</strong>
              <br />
              Category: {place.category === 'restaurant' ? 'Restaurant / Cafe' : 'Tourist spot'}
              <br />
              Entrance: {place.isFree ? 'Free' : 'Paid'}
              <br />
              Hours: {place.openingHours}
              <br />
              Distance: {place.distanceKm} km
            </Popup>
          </Marker>
        ))}

      {days.map((day) => {
        const color = DAY_COLORS[(day.dayIndex - 1) % DAY_COLORS.length];
        return (
          <React.Fragment key={day.dayIndex}>
            {day.stops.map((stop) => (
              <Marker
                key={`${day.dayIndex}-${stop.stepOrder}`}
                position={[stop.lat, stop.lng]}
                icon={numberIcon(stop.stepOrder, color)}
              >
                <Popup>
                  <strong>
                    Day {day.dayIndex} · {stop.stepOrder}. {stop.name}
                  </strong>
                  <br />
                  Visit: {stop.estimatedTime}
                </Popup>
              </Marker>
            ))}
          </React.Fragment>
        );
      })}

      {days.map((day) => {
        let line: Array<[number, number]> = [];
        if (day.geometry && day.geometry.length > 1) {
          line = day.geometry;
        } else if (day.stops.length > 0) {
          line = day.stops.map((s) => [s.lat, s.lng] as [number, number]);
          if (base) line.unshift([base.lat, base.lng]);
        }
        if (line.length < 2) return null;
        return (
          <Polyline
            key={`route-${day.dayIndex}`}
            positions={line}
            color={DAY_COLORS[(day.dayIndex - 1) % DAY_COLORS.length]}
            weight={4}
            dashArray="5, 10"
          />
        );
      })}
    </MapContainer>
  );
};
