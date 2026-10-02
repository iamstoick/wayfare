import React, { useState } from 'react';
import type { DayPlan, ItineraryStop } from '../services/api';
import { useAuth } from '../hooks/useAuth';

interface ItineraryPanelProps {
  days: DayPlan[];
  returnBy?: string | null;
  onSave: (title: string) => Promise<void>;
  saving: boolean;
  onAddMeals: () => Promise<void>;
  addingMeals: boolean;
  onReorder: (dayIndex: number, stops: ItineraryStop[]) => void;
  retimingDay: number | null;
}

function formatDayDate(dateISO: string | null): string {
  if (!dateISO) return '';
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export const ItineraryPanel: React.FC<ItineraryPanelProps> = ({
  days,
  returnBy,
  onSave,
  saving,
  onAddMeals,
  addingMeals,
  onReorder,
  retimingDay,
}) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [drag, setDrag] = useState<{ day: number; idx: number } | null>(null);
  const [over, setOver] = useState<{ day: number; idx: number } | null>(null);

  if (days.length === 0 || days.every((d) => d.stops.length === 0)) {
    return (
      <p className="empty-note">
        No itinerary yet. Pin a location, then click “Generate itinerary”.
      </p>
    );
  }

  const hasMeals = days.some((d) => d.stops.some((s) => s.category === 'restaurant'));

  const handleSave = async () => {
    setSaveError(null);
    setSaved(false);
    try {
      await onSave(title.trim() || `Trip ${new Date().toLocaleDateString()}`);
      setSaved(true);
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };

  const handleDrop = (day: DayPlan, toIdx: number) => {
    if (!drag || drag.day !== day.dayIndex) return;
    const fromIdx = drag.idx;
    setDrag(null);
    setOver(null);
    if (fromIdx === toIdx) return;
    const next = [...day.stops];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(day.dayIndex, next);
  };

  return (
    <div className="itinerary">
      {returnBy && (
        <p className="return-note">
          Back at the start by <strong>{returnBy}</strong> (buffer included).
        </p>
      )}

      {days.map((day) => (
        <section key={day.dayIndex} className="day-group">
          {days.length > 1 && (
            <h3 className="day-head">
              Day {day.dayIndex}
              {day.dateISO && <span className="day-date"> · {formatDayDate(day.dateISO)}</span>}
            </h3>
          )}
          {retimingDay === day.dayIndex && (
            <p className="empty-note">Updating times…</p>
          )}
          <ol className="itinerary-list">
            {day.stops.map((stop, idx) => (
              <li
                key={`${stop.stepOrder}-${stop.id}`}
                className={
                  'itinerary-stop' +
                  (over && over.day === day.dayIndex && over.idx === idx ? ' drop-target' : '')
                }
                draggable
                onDragStart={() => setDrag({ day: day.dayIndex, idx })}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver({ day: day.dayIndex, idx });
                }}
                onDrop={() => handleDrop(day, idx)}
                title="Drag to reorder"
              >
                <span className="stop-order" aria-hidden="true">
                  {stop.stepOrder}
                </span>
                <div className="stop-body">
                  <div className="stop-time">{stop.estimatedTime}</div>
                  <strong>{stop.name}</strong>
                  <div className="place-meta">
                    <span>{stop.category === 'restaurant' ? 'Meal stop' : 'Tourist spot'}</span>
                    {!stop.isFree && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Paid entrance</span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {!hasMeals && (
        <div className="meals-row">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={onAddMeals}
            disabled={addingMeals}
          >
            {addingMeals ? 'Adding meal stops…' : 'OK, add meal stops'}
          </button>
        </div>
      )}

      {user ? (
        <div className="save-row">
          <input
            className="input"
            placeholder="Trip title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Trip title"
          />
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save trip'}
          </button>
        </div>
      ) : (
        <p className="empty-note">Sign in with Google to save this trip.</p>
      )}
      {saveError && <p className="error-note">{saveError}</p>}
      {saved && <p className="success-note">Saved to My Trips.</p>}
    </div>
  );
};
