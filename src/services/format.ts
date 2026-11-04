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