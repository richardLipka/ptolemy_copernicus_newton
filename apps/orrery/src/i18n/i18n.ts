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
  // Guarded so the dictionary can be exercised where there is no document —
  // the test environment is plain Node, and the formatters below are worth
  // pinning against a cache that forgets which language it is holding.
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

/**
 * Does this key exist at all?
 *
 * `t` deliberately returns the key itself when it does not, which is right for
 * display — an untranslated string is then obvious on screen — but useless to a
 * caller choosing between a specific wording and a general one. The harness
 * notes do exactly that: `harness.note.deferent.ptolemaic` where it exists,
 * `harness.note.deferent` otherwise.
 */
export function hasTranslation(key: string): boolean {
  return key in DICTIONARIES[current] || key in DICTIONARIES.en;
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

/*
 * Formatters are built once and kept, keyed by locale and shape.
 *
 * Constructing one is expensive out of all proportion to using it — measured at
 * 0.023 ms for a number and 0.051 ms for a date, against roughly a thousandth
 * of that to format with an existing instance. That is nothing once and a great
 * deal sixty times a second, which is what the app was doing: the clock readout
 * rebuilt a date formatter every frame, one hover card rebuilt four number
 * formatters, and the info panel rebuilt some twenty per redraw.
 *
 * The locale is part of the key, so switching language needs no invalidation
 * and both sets of formatters survive being switched back and forth.
 */
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

const intlLocale = (): string => (current === 'cs' ? 'cs-CZ' : 'en-GB');

function dateFormat(
  key: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const locale = intlLocale();
  const cacheKey = `${locale}|${key}`;
  let format = dateFormats.get(cacheKey);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(cacheKey, format);
  }
  return format;
}

/** Date formatting in the active locale, calendar-only. */
export function formatDate(date: Date): string {
  return dateFormat('date', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return dateFormat('datetime', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function formatNumber(value: number, fractionDigits = 2): string {
  const locale = intlLocale();
  const cacheKey = `${locale}|${fractionDigits}`;
  let format = numberFormats.get(cacheKey);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    numberFormats.set(cacheKey, format);
  }
  return format.format(value);
}

/**
 * A magnitude as a mantissa and a power of ten.
 *
 * Gravitational pulls span twelve orders of magnitude between the Sun's grip
 * and Saturn's, so fixed-point notation is unreadable and locale grouping is
 * beside the point.
 */
export function formatExponent(value: number): string {
  if (value === 0) return '0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const mantissa = value / 10 ** exponent;
  return `${formatNumber(mantissa, 2)}·10${superscript(exponent)}`;
}

const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

const superscript = (exponent: number): string =>
  (exponent < 0 ? '⁻' : '') +
  Math.abs(exponent)
    .toString()
    .split('')
    .map((digit) => SUPERSCRIPTS[Number(digit)])
    .join('');

/**
 * A pull's share of the total, with room for the very small ones — and a
 * ceiling, so the largest never claims to be all of it.
 *
 * The Sun takes 99.994% of the pull on Mars, which rounds to a flat 100.0% and
 * reads as "nothing else acts on this planet". That is the opposite of what the
 * figure beside it is for.
 */
export function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 99.95) return `> ${formatNumber(99.9, 1)} %`;
  if (percent >= 1) return `${formatNumber(percent, 1)} %`;
  if (percent >= 0.001) return `${formatNumber(percent, 3)} %`;
  return `< ${formatNumber(0.001, 3)} %`;
}
