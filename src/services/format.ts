// Hungarian date/time formatting helpers shared by the tab screens.
// Kept out of components so every screen renders the same format.

import hu from '../i18n/hu';

const LOCALE = 'hu-HU';

function toDate(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** e.g. "2026. 11. 04." */
export function formatDateHu(iso: string): string {
  const date = toDate(iso);
  if (date === null) {
    return iso;
  }
  return date.toLocaleDateString(LOCALE, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** e.g. "2026. 11. 04. 18:30" */
export function formatDateTimeHu(iso: string): string {
  const date = toDate(iso);
  if (date === null) {
    return iso;
  }
  const time = date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  return `${formatDateHu(iso)} ${time}`;
}

/** e.g. "november 4., szerda" */
export function formatTodayHu(date: Date = new Date()): string {
  return date.toLocaleDateString(LOCALE, { month: 'long', day: 'numeric', weekday: 'long' });
}

/** "45 perc" / "0 perc" — rest times are stored in seconds. */
export function formatRestHu(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${hu.common.minutesShort}`;
}

/** "1:12:30" for durations in seconds. */
export function formatDurationHu(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** "5:30" per kilometre, or an em dash when no pace can be derived. */
export function formatPaceHu(secondsPerKm: number): string {
  if (!(secondsPerKm > 0)) {
    return '—';
  }
  const total = Math.round(secondsPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** "82,5 kg" — Hungarian decimal comma, no trailing zeros ("100 kg"). */
export function formatWeightKg(weightKg: number): string {
  if (!Number.isFinite(weightKg)) {
    return '—';
  }
  const text = Number.isInteger(weightKg)
    ? weightKg.toString()
    : weightKg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
  return `${text} ${hu.common.kg}`;
}

/** "114,6 kg" for an estimated 1RM, or an em dash when nothing could be estimated. */
export function formatOneRepMaxKg(oneRepMaxKg: number): string {
  if (!(oneRepMaxKg > 0)) {
    return '—';
  }
  return `${oneRepMaxKg.toFixed(1).replace('.', ',')} ${hu.common.kg}`;
}

/**
 * Renders a template block's prescription, e.g. "4 × 5 @ 87,5 kg", "3 × AMRAP",
 * or "3 × 8-12 @ BW". A plain numeric weight gets a unit and a Hungarian comma;
 * any other notation ("BW", "25; 20; 15", "75%") is shown verbatim.
 */
export function formatTargetPrescription(
  targetSets?: number,
  targetReps?: string,
  targetWeight?: string,
): string {
  const reps = `${targetSets ?? 1} × ${targetReps ?? '—'}`;
  if (targetWeight === undefined || targetWeight.trim().length === 0) {
    return reps;
  }
  const raw = targetWeight.trim();
  const shown = /^\d+(?:[.,]\d+)?$/.test(raw)
    ? `${raw.replace('.', ',')} ${hu.common.kg}`
    : raw;
  return `${reps} @ ${shown}`;
}