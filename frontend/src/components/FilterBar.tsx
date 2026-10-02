import React from 'react';

export const RADIUS_OPTIONS = [1, 3, 5, 10];

interface FilterBarProps {
  radiusKm: number;
  onRadiusChange: (km: number) => void;
  freeOnly: boolean;
  onFreeOnlyChange: (value: boolean) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  radiusKm,
  onRadiusChange,
  freeOnly,
  onFreeOnlyChange,
}) => (
  <div className="filter-bar">
    <label className="filter-radius">
      Radius
      <select
        className="input"
        value={radiusKm}
        onChange={(e) => onRadiusChange(Number(e.target.value))}
      >
        {RADIUS_OPTIONS.map((km) => (
          <option key={km} value={km}>
            {km} km
          </option>
        ))}
      </select>
    </label>
    <label className="filter-free">
      <input
        type="checkbox"
        checked={freeOnly}
        onChange={(e) => onFreeOnlyChange(e.target.checked)}
      />
      Free entrance only
    </label>
  </div>
);
