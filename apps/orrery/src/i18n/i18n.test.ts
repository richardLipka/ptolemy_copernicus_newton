/**
 * The formatters are cached, so the cache has to know which language it holds.
 *
 * Building an `Intl` formatter costs about forty times what using one does, so
 * they are kept — and a kept formatter is exactly the kind of thing that goes
 * on speaking Czech after the reader has asked for English. The locale is part
 * of the key; this is what says so.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { formatDateTime, formatNumber, getLocale, setLocale, t } from './i18n';

const original = getLocale();
afterAll(() => setLocale(original));

describe('cached formatters follow the locale', () => {
  it('switches the decimal separator with the language', () => {
    setLocale('cs');
    expect(formatNumber(1.5, 1)).toBe('1,5');

    setLocale('en');
    expect(formatNumber(1.5, 1)).toBe('1.5');

    // And back, which is the case a cache keyed only on the digits would fail.
    setLocale('cs');
    expect(formatNumber(1.5, 1)).toBe('1,5');
  });

  it('keeps one formatter per number of digits', () => {
    setLocale('en');
    expect(formatNumber(1.23456, 2)).toBe('1.23');
    expect(formatNumber(1.23456, 4)).toBe('1.2346');
    expect(formatNumber(1.23456, 0)).toBe('1');
  });

  it('switches dates with the language too', () => {
    const date = new Date(Date.UTC(2026, 2, 15, 12, 0));

    setLocale('en');
    const english = formatDateTime(date);
    setLocale('cs');
    const czech = formatDateTime(date);

    expect(english).not.toBe(czech);
    expect(english).toContain('2026');
    expect(czech).toContain('2026');
  });

  it('still answers from the dictionary of the moment', () => {
    setLocale('cs');
    const czech = t('harness.part.equant');
    setLocale('en');
    expect(t('harness.part.equant')).not.toBe('harness.part.equant');
    expect(czech).toBe('Ekvant');
  });
});
