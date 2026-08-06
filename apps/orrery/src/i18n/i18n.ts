/**
 * Localisation. Czech is the default; English is a toggle.
 *
 * Both dictionaries are bundled rather than fetched, because the app has to
 * work as static files with no network at runtime.
 */

import cs from './cs.json';
import en from './en.json';
import { BODIES, type BodyId } from '@orrery/core/bodies';

export type Locale = 'cs' | 'en';

export const LOCALES: readonly Locale[] = ['cs', 'en'];

const DICTIONARIES: Record<Locale, Record<string, string>> = { cs, en };

const STORAGE_KEY = 'orrery.locale';

/**
 * Read a stored preference.
 *
 * The app is served from a university web host with no backend, so
 * localStorage is the only persistence available — and it may be disabled or
 * full. Every access is guarded; losing the preference is not worth an
 * exception.
 */
function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'cs' || stored === 'en' ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Preference simply will not persist; nothing else depends on it.
  }
}

let current: Locale = readStoredLocale() ?? 'cs';

export const getLocale = (): Locale => current;

export function setLocale(locale: Locale): void {
  current = locale;
  writeStoredLocale(locale);
  document.documentElement.lang = locale;
}

/**
 * Look up a key, substituting `{{name}}` placeholders.
 *
 * A missing key returns the key itself rather than throwing or falling back
 * silently — that way an untranslated string is obvious on screen instead of
 * quietly reading as English in a Czech interface.
 */
export function t(key: string, values?: Record<string, string | number>): string {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES.en[key] ?? key;
  if (!values) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export type GrammaticalCase = 'nominative' | 'genitive';

/**
 * A body's name in the requested case.
 *
 * Czech inflects, so "conjunction of Mars and Jupiter" needs the genitive:
 * *konjunkce Marsu a Jupiteru*, not *konjunkce Mars a Jupiter*. English keeps
 * one form and ignores the argument. Nine bodies makes storing the forms
 * cheaper than any clever morphology.
 */
export const bodyName = (id: BodyId, grammaticalCase: GrammaticalCase = 'nominative'): string =>
  BODIES[id].names[current][grammaticalCase];

/** Date formatting in the active locale, calendar-only. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(current === 'cs' ? 'cs-CZ' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(current === 'cs' ? 'cs-CZ' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function formatNumber(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat(current === 'cs' ? 'cs-CZ' : 'en-GB', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
