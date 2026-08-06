/** JD of the J2000.0 epoch (2000-01-01 12:00 TT). */
export const J2000 = 2451545.0;

export const DAYS_PER_JULIAN_CENTURY = 36525;

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Gregorian calendar date to Julian Date (Meeus, Astronomical Algorithms ch. 7).
 * Dates before the 1582 Gregorian reform fall outside the supported range and
 * are treated as proleptic Gregorian.
 */
export function jdFromCalendar(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  const dayFraction = day + hour / 24 + minute / 1440 + second / 86400;
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    dayFraction +
    b -
    1524.5
  );
}

export function calendarFromJd(jd: number): CalendarDate {
  const shifted = jd + 0.5;
  const z = Math.floor(shifted);
  const f = shifted - z;

  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const dayWithFraction = b - d - Math.floor(30.6001 * e) + f;
  const day = Math.floor(dayWithFraction);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;

  let remainingHours = (dayWithFraction - day) * 24;
  let hour = Math.floor(remainingHours);
  remainingHours = (remainingHours - hour) * 60;
  let minute = Math.floor(remainingHours);
  let second = Math.round((remainingHours - minute) * 60);

  // Rounding seconds can cascade; normalize rather than emit 60.
  if (second === 60) {
    second = 0;
    minute += 1;
  }
  if (minute === 60) {
    minute = 0;
    hour += 1;
  }

  return { year, month, day, hour, minute, second };
}

export const jdFromDate = (date: Date): number =>
  jdFromCalendar(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );

export function dateFromJd(jd: number): Date {
  const c = calendarFromJd(jd);
  return new Date(
    Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second),
  );
}

/** Julian centuries since J2000.0 — the argument for secular element rates. */
export const centuriesSinceJ2000 = (jd: number): number =>
  (jd - J2000) / DAYS_PER_JULIAN_CENTURY;

/** Supported range: 1600-01-01 through 2400-01-01 (see CLAUDE.md §3). */
export const MIN_JD = jdFromCalendar(1600, 1, 1);
export const MAX_JD = jdFromCalendar(2400, 1, 1);

export const clampJd = (jd: number): number =>
  Math.min(MAX_JD, Math.max(MIN_JD, jd));

export const isInSupportedRange = (jd: number): boolean =>
  jd >= MIN_JD && jd <= MAX_JD;

/**
 * Simulation clock. Advanced explicitly with elapsed real time so it stays
 * pure and testable; the requestAnimationFrame driver lives in the UI layer.
 */
export class SimulationClock {
  private jd: number;
  /** Simulated days per real second. */
  private daysPerSecond: number;
  private running: boolean;

  constructor(jd: number = jdFromDate(new Date()), daysPerSecond = 1) {
    this.jd = clampJd(jd);
    this.daysPerSecond = daysPerSecond;
    this.running = false;
  }

  get julianDate(): number {
    return this.jd;
  }

  get rate(): number {
    return this.daysPerSecond;
  }

  get isRunning(): boolean {
    return this.running;
  }

  setJd(jd: number): void {
    this.jd = clampJd(jd);
  }

  setRate(daysPerSecond: number): void {
    this.daysPerSecond = daysPerSecond;
  }

  play(): void {
    this.running = true;
  }

  pause(): void {
    this.running = false;
  }

  /** Advance by real elapsed seconds. No-op while paused. */
  advance(realSeconds: number): void {
    if (!this.running) return;
    this.setJd(this.jd + realSeconds * this.daysPerSecond);
  }

  /** Unconditional jump by a number of simulated days, ignoring play state. */
  step(days: number): void {
    this.setJd(this.jd + days);
  }
}
