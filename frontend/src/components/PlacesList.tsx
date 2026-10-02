import React, { useState } from 'react';
import { api, type Enrichment, type Place } from '../services/api';

const PlaceCard: React.FC<{ place: Place }> = ({ place }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<Enrichment | null | undefined>(undefined);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (info !== undefined) return;
    setLoading(true);
    try {
      const { enrichment } = await api.enrich(place.lat, place.lng, place.name);
      setInfo(enrichment);
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="place-card">
      <div className="place-head">
        <strong>{place.name}</strong>
        <span className={`badge ${place.isFree ? 'badge-free' : 'badge-paid'}`}>
          {place.isFree ? 'Free' : 'Paid'}
        </span>
      </div>
      <div className="place-meta">
        <span>{place.category === 'restaurant' ? 'Restaurant / Cafe' : 'Tourist spot'}</span>
        <span aria-hidden="true">·</span>
        <span>{place.distanceKm} km away</span>
        {place.openNow === true && (
          <>
            <span aria-hidden="true">·</span>
            <span className="open-now">Open now</span>
          </>
        )}
        {place.openNow === false && (
          <>
            <span aria-hidden="true">·</span>
            <span className="open-closed">Closed now</span>
          </>
        )}
      </div>
      <div className="place-hours">Hours: {place.openingHours}</div>
      <button type="button" className="btn btn-ghost btn-small" onClick={toggle}>
        {open ? 'Hide details' : 'Details'}
      </button>
      {open && (
        <div className="enrichment">
          {loading && <p className="empty-note">Loading details…</p>}
          {!loading && info && (
            <>
              {info.thumbnailUrl && (
                <img src={info.thumbnailUrl} alt="" className="enrichment-thumb" loading="lazy" />
              )}
              <p className="enrichment-text">{info.description || 'No summary available.'}</p>
              <a href={info.wikipediaUrl} target="_blank" rel="noreferrer" className="enrichment-link">
                Read on Wikipedia
              </a>
            </>
          )}
          {!loading && info === null && (
            <p className="empty-note">No Wikipedia article found nearby.</p>
          )}
        </div>
      )}
    </li>
  );
};

export const PlacesList: React.FC<{ places: Place[] }> = ({ places }) => {
  if (places.length === 0) {
    return (
      <p className="empty-note">
        No places found here yet. Pin a location on the map or search above.
      </p>
    );
  }

  return (
    <ul className="places-list">
      {places.map((place) => (
        <PlaceCard key={place.osmId} place={place} />
      ))}
    </ul>
  );
};
