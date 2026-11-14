// Multi-day workout-sheet parser (Google Sheets / CSV / TSV).
//
// The coach pastes a spreadsheet whose first column carries the day label only
// on its FIRST row: Google Sheets renders Column A with vertically merged cells,
// so a CSV/TSV export leaves Column A empty for every subsequent row of the same
// day. The parser therefore CARRIES FORWARD the active day name across rows
// whose Column A is blank.
//
// Column layout (A..G):
//   A Day            (merged; only the first row of a day is filled)
//   B Exercise       e.g. "Deadlift (75%)", "Toshiki Raises", "BB BSS"
//   C Weight         "87,5" | "BW" | "35?" | "25; 20; 15" | "20-20" | "75%"
//   D Sets           integer
//   E Target Reps    "5" | "1+" | "AMRAP" | "8-12" | "9+" | "6+, 6-12, underh"
//   F Achieved Reps  optional historical note
//   G Comments       optional cue/note ("speed", "coolio")
//
// This module is deliberately pure (no DB, no network) so it can be unit-tested
// and reused by any transport: the admin paste box and the Google export fetch.

/** One exercise row, grouped under its day. */
export interface ParsedSheetExercise {
  /** Raw exercise cell, e.g. "Deadlift (75%)". */
  raw: string;
  /** Name with the parenthetical prescription stripped, e.g. "Deadlift". */
  name: string;
  /** Parenthetical prescription captured from the name, e.g. "75%". */
  prescription?: string;
  targetSets: number;
  /** Raw target-reps prescription ("" when the cell was empty). */
  targetReps: string;
  /** Raw weight cell exactly as typed, e.g. "87,5", "BW", "25; 20; 15". */
  weightRaw?: string;
  /** Numeric kg — only when the weight cell is a single number ("87,5" -> 87.5). */
  weightKg?: number;
  /** Combined comment / achieved-reps note, when present. */
  notes?: string;
}

/** All exercises sharing one carried-forward day label. */
export interface ParsedSheetDay {
  /** Day label from Column A (e.g. "Day 1"), carried forward across its rows. */
  day: string;
  /** Template title for this day (defaults to the day label). */
  title: string;
  exercises: ParsedSheetExercise[];
}

export interface ParsedSheet {
  days: ParsedSheetDay[];
}

const HEADER_EXERCISE_TOKENS = new Set(['exercise', 'gyakorlat', 'feladat']);

/**
 * Splits one CSV/TSV line into cells. Quote-aware for CSV: a field wrapped in
 * double quotes may contain the delimiter and escaped quotes ("").
 */
function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t');
  }
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** Picks the delimiter: a real TSV paste contains tabs; otherwise assume CSV. */
function detectDelimiter(text: string): string {
  return text.includes('\t') ? '\t' : ',';
}

interface PrefixedName {
  name: string;
  prescription?: string;
}

/** "Deadlift (75%)" -> { name: "Deadlift", prescription: "75%" }. */
function splitPrescription(raw: string): PrefixedName {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw);
  if (match === null) {
    return { name: raw.trim() };
  }
  const name = match[1].trim();
  const prescription = match[2].trim();
  return prescription.length > 0 ? { name, prescription } : { name };
}

/**
 * Parses a single weight cell. Returns the numeric kg only when the cell is one
 * Hungarian decimal number ("87,5" -> 87.5); every other prescription ("BW",
 * "35?", "25; 20; 15", "20-20", "75%") keeps `weightKg` undefined and is
 * preserved verbatim in `weightRaw`.
 */
function parseWeight(raw: string): { weightRaw?: string; weightKg?: number } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {};
  }
  const single = /^-?\d+(?:[.,]\d+)?$/.exec(trimmed);
  if (single !== null) {
    return { weightRaw: trimmed, weightKg: Number(trimmed.replace(',', '.')) };
  }
  return { weightRaw: trimmed };
}

function parseSets(raw: string): number {
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function buildNotes(comments: string, achievedReps: string): string | undefined {
  const tokens: string[] = [];
  if (comments.trim().length > 0) {
    tokens.push(comments.trim());
  }
  if (achievedReps.trim().length > 0) {
    tokens.push(`Elért: ${achievedReps.trim()}`);
  }
  return tokens.length > 0 ? tokens.join(' · ') : undefined;
}

/** True for a row that is a column header rather than data. */
function isHeaderRow(cells: string[]): boolean {
  const exercise = (cells[1] ?? '').trim().toLowerCase();
  return HEADER_EXERCISE_TOKENS.has(exercise);
}

/**
 * Parses the whole sheet into day-grouped exercises. Blank lines and header
 * rows are skipped; the active day is carried forward while Column A is empty.
 */
export function parseWorkoutSheet(text: string): ParsedSheet {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const delimiter = detectDelimiter(text);

  const days: ParsedSheetDay[] = [];
  const byDay = new Map<string, ParsedSheetDay>();
  let activeDay: string | null = null;

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const cells = splitLine(line, delimiter);
    if (isHeaderRow(cells)) {
      continue;
    }

    const dayCell = (cells[0] ?? '').trim();
    if (dayCell.length > 0) {
      activeDay = dayCell;
    }
    if (activeDay === null) {
      // A data row before any day label — nothing to attach it to.
      continue;
    }

    const exerciseCell = (cells[1] ?? '').trim();
    if (exerciseCell.length === 0) {
      continue;
    }

    const { name, prescription } = splitPrescription(exerciseCell);
    const { weightRaw, weightKg } = parseWeight(cells[2] ?? '');
    const exercise: ParsedSheetExercise = {
      raw: exerciseCell,
      name,
      targetSets: parseSets(cells[3] ?? ''),
      targetReps: (cells[4] ?? '').trim(),
    };
    if (prescription !== undefined) {
      exercise.prescription = prescription;
    }
    if (weightRaw !== undefined) {
      exercise.weightRaw = weightRaw;
    }
    if (weightKg !== undefined) {
      exercise.weightKg = weightKg;
    }
    const notes = buildNotes(cells[6] ?? '', cells[5] ?? '');
    if (notes !== undefined) {
      exercise.notes = notes;
    }

    let group = byDay.get(activeDay);
    if (group === undefined) {
      group = { day: activeDay, title: activeDay, exercises: [] };
      byDay.set(activeDay, group);
      days.push(group);
    }
    group.exercises.push(exercise);
  }

  return { days };
}

export interface GoogleSheetRef {
  id: string;
  /** The `gid` (sheet tab id) when the URL carries one. */
  gid?: string;
}

/**
 * Extracts the spreadsheet id and optional gid from a Google Sheets share URL,
 * e.g. "https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>".
 * Returns null for anything that is not a Google Sheets document URL.
 */
export function parseGoogleSheetUrl(url: string): GoogleSheetRef | null {
  const match = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  if (match === null) {
    return null;
  }
  const id = match[1];
  const gidMatch = /[#&?]gid=([0-9]+)/.exec(url);
  return gidMatch === null ? { id } : { id, gid: gidMatch[1] };
}

/** The CSV export URL for a spreadsheet (optionally one gid/tab). */
export function googleSheetCsvUrl(ref: GoogleSheetRef): string {
  const base = `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=csv`;
  return ref.gid === undefined ? base : `${base}&gid=${ref.gid}`;
}
