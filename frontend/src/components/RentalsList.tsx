import React from 'react';
import type { Rental } from '../services/api';

const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

const vehicleLabel = (t: Rental['vehicleTypes'][number]) =>
  t === 'car' ? 'Car' : 'Motorcycle';

const siteHref = (site: string) => (site.startsWith('http') ? site : `https://${site}`);

const RentalCard: React.FC<{ rental: Rental }> = ({ rental }) => (
  <li className="place-card">
    <div className="place-head">
      <strong>{rental.name}</strong>
      <span className="vehicle-badges">
        {rental.vehicleTypes.map((t) => (
          <span key={t} className="badge badge-vehicle">
            {vehicleLabel(t)}
          </span>
        ))}
      </span>
    </div>
    <div className="place-meta">
      <span>{rental.distanceKm} km away</span>
      {rental.openNow === true && (
        <>
          <span aria-hidden="true">·</span>
          <span className="open-now">Open now</span>
        </>
      )}
      {rental.openNow === false && (
        <>
          <span aria-hidden="true">·</span>
          <span className="open-closed">Closed now</span>
        </>
      )}
    </div>
    <div className="place-hours">Hours: {rental.openingHours}</div>
    {rental.phone && <div className="place-hours">Phone: {rental.phone}</div>}
    {rental.website && (
      <div className="place-hours">
        <a
          href={siteHref(rental.website)}
          target="_blank"
          rel="noreferrer"
          className="rental-site"
        >
          Website
        </a>
      </div>
    )}
    <ul className="rate-list" aria-label="Estimated daily rates">
      {rental.estimates.map((e) => (
        <li key={e.vehicleType} className="rate-row">
          <span>{e.label}</span>
          <span className="rate-value">
            ≈ {peso(e.dailyMin)}–{peso(e.dailyMax)} / day
          </span>
        </li>
      ))}
    </ul>
  </li>
);

export const RentalsList: React.FC<{ rentals: Rental[] }> = ({ rentals }) => {
  if (rentals.length === 0) {
    return (
      <p className="empty-note">
        No car or motorcycle rentals found here yet. Pin a location on the map or search above.
      </p>
    );
  }

  return (
    <>
      <p className="rate-note">
        Typical walk-in daily rates, excluding fuel and deposit. Actual prices vary by shop.
      </p>
      <ul className="places-list">
        {rentals.map((rental) => (
          <RentalCard key={rental.osmId} rental={rental} />
        ))}
      </ul>
    </>
  );
};
