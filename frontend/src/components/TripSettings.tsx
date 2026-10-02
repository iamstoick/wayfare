import React from 'react';
import type { TripMode, Pace, TransportMode } from '../services/api';

export interface TripSettings {
  mode: TripMode;
  numDays: number;
  startTime: string;
  startDate: string;
  pace: Pace;
  transport: TransportMode;
  skipClosed: boolean;
  budgetHours: number;
  bufferMinutes: number;
}

export function defaultSettings(): TripSettings {
  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    mode: 'day',
    numDays: 3,
    startTime: '09:00',
    startDate,
    pace: 'standard',
    transport: 'transit',
    skipClosed: true,
    budgetHours: 5,
    bufferMinutes: 60,
  };
}

interface TripSettingsProps {
  settings: TripSettings;
  onChange: (next: TripSettings) => void;
}

const MODES: Array<{ value: TripMode; label: string }> = [
  { value: 'day', label: 'Day trip' },
  { value: 'multi', label: 'Multi-day' },
  { value: 'layover', label: 'Layover' },
];

export const TripSettingsForm: React.FC<TripSettingsProps> = ({ settings, onChange }) => {
  const set = <K extends keyof TripSettings>(key: K, value: TripSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="settings">
      <div className="segmented" role="tablist" aria-label="Trip mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={settings.mode === m.value}
            className={settings.mode === m.value ? 'segment active' : 'segment'}
            onClick={() => set('mode', m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {settings.mode === 'multi' && (
        <label className="setting-row">
          Days
          <select
            className="input"
            value={settings.numDays}
            onChange={(e) => set('numDays', Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
      )}

      {settings.mode === 'layover' && (
        <>
          <label className="setting-row">
            Hours available
            <select
              className="input"
              value={settings.budgetHours}
              onChange={(e) => set('budgetHours', Number(e.target.value))}
            >
              {[3, 4, 5, 6, 8, 10, 12].map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row">
            Return buffer
            <select
              className="input"
              value={settings.bufferMinutes}
              onChange={(e) => set('bufferMinutes', Number(e.target.value))}
            >
              {[30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="settings-grid">
        <label className="setting-row">
          Start
          <input
            className="input"
            type="time"
            value={settings.startTime}
            onChange={(e) => set('startTime', e.target.value)}
          />
        </label>
        {settings.mode !== 'layover' && (
          <label className="setting-row">
            Date
            <input
              className="input"
              type="date"
              value={settings.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </label>
        )}
        <label className="setting-row">
          Pace
          <select
            className="input"
            value={settings.pace}
            onChange={(e) => set('pace', e.target.value as Pace)}
          >
            <option value="relaxed">Relaxed</option>
            <option value="standard">Standard</option>
            <option value="packed">Packed</option>
          </select>
        </label>
        <label className="setting-row">
          Getting around
          <select
            className="input"
            value={settings.transport}
            onChange={(e) => set('transport', e.target.value as TransportMode)}
          >
            <option value="walk">On foot</option>
            <option value="bike">Bike</option>
            <option value="transit">Transit</option>
            <option value="drive">Drive</option>
          </select>
        </label>
      </div>

      <label className="filter-free">
        <input
          type="checkbox"
          checked={settings.skipClosed}
          onChange={(e) => set('skipClosed', e.target.checked)}
        />
        Skip places closed at visit time
      </label>
    </div>
  );
};
