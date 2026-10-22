import { DataError } from './http.js';
import type { TimeWindow } from './types.js';

export function calendarWindow(
  query: TimeWindow,
  now: Date,
  timezone: string,
): { from: string; to: string } {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const currentYear = Number(today.slice(0, 4));
  if (
    query.year !== undefined &&
    (!Number.isInteger(query.year) || query.year < 1000 || query.year > currentYear)
  ) {
    throw new DataError('year must be a calendar year no later than today', 'input');
  }
  if (query.from !== undefined || query.to !== undefined) {
    if (query.year !== undefined) throw new DataError('Select year or a date window', 'input');
    const from = query.from ?? dayOffset(today, -364);
    const to = query.to ?? today;
    if (
      ![from, to].every(validDate) ||
      from > to ||
      to > today ||
      (Date.parse(to) - Date.parse(from)) / 86_400_000 > 365
    ) {
      throw new DataError('Invalid activity date window', 'input');
    }
    return { from, to };
  }
  return query.year === undefined
    ? { from: dayOffset(today, -364), to: today }
    : { from: query.year + '-01-01', to: query.year < currentYear ? query.year + '-12-31' : today };
}

export function validateCalendarYear(
  year: number | undefined,
  source: 'github' | 'cnb',
  now: Date,
): readonly { path: string; message: string }[] {
  if (year === undefined) return [];
  try {
    calendarWindow({ year }, now, source === 'cnb' ? 'Asia/Shanghai' : 'UTC');
    return [];
  } catch (error) {
    if (error instanceof DataError && error.kind === 'input')
      return [{ path: 'year', message: error.message }];
    throw error;
  }
}

export function dayOffset(date: string, amount: number): string {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function validDate(value: string): boolean {
  const date = new Date(value + 'T00:00:00Z');
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}
export function dates(from: string, to: string): string[] {
  const result: string[] = [];
  for (let date = from; date <= to; date = dayOffset(date, 1)) result.push(date);
  return result;
}
