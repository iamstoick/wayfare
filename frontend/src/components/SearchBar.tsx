import React, { useEffect, useRef, useState } from 'react';
import { api, type GeocodeHit } from '../services/api';

interface SearchBarProps {
  onSelect: (hit: GeocodeHit) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (query.trim().length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = window.setTimeout(async () => {
      try {
        const { results } = await api.geocode(query.trim());
        setResults(results);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="search-wrap">
      <input
        className="input"
        type="search"
        placeholder="Search a city or place…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        aria-label="Search location"
      />
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.map((hit) => (
            <li key={`${hit.lat},${hit.lng}`}>
              <button
                type="button"
                onMouseDown={() => {
                  onSelect(hit);
                  setOpen(false);
                  setQuery(hit.displayName);
                }}
              >
                {hit.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && <span className="search-hint">Searching…</span>}
    </div>
  );
};
