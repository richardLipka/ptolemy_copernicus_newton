/**
 * The shareable configuration.
 *
 * A link may be hand-edited, truncated by a mail client, or written against an
 * older version of the app. None of those may produce a broken screen, so every
 * field is validated on its own and a bad one is dropped rather than trusted.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { jdFromCalendar } from '../core/time';
import { Store } from './store';
import { encodeUrlState, readUrlState, type UrlState } from './urlState';

const FULL: UrlState = {
  mode: 'ptolemy',
  engineId: 'ptolemaic-almagest',
  frameOrigin: 'earth',
  observationPoint: 'mars',
  sphereCentre: 'observer',
  julianDate: jdFromCalendar(1610, 1, 7),
};

describe('encoding', () => {
  it('round-trips a complete configuration', () => {
    expect(readUrlState(encodeUrlState(FULL))).toEqual(FULL);
  });

  it('produces a hash a human can read', () => {
    // The URL is itself a small piece of documentation; keep it legible.
    const encoded = encodeUrlState(FULL);
    expect(encoded.startsWith('#')).toBe(true);
    expect(encoded).toContain('model=ptolemy');
    expect(encoded).toContain('centre=earth');
    expect(encoded).toContain('sphere=observer');
  });
});

describe('reading a link that cannot be trusted', () => {
  it('ignores unknown values field by field', () => {
    const state = readUrlState('#model=aristotle&centre=pluto&observer=venus');
    // The two nonsense fields vanish; the good one survives.
    expect(state.mode).toBeUndefined();
    expect(state.frameOrigin).toBeUndefined();
    expect(state.observationPoint).toBe('venus');
  });

  it('returns nothing at all for an empty or absent hash', () => {
    expect(readUrlState('')).toEqual({});
    expect(readUrlState('#')).toEqual({});
  });

  it('survives junk', () => {
    expect(() => readUrlState('#=&&&%%%=x')).not.toThrow();
    expect(readUrlState('#=&&&%%%=x')).toEqual({});
  });

  it('accepts a partial link', () => {
    // Truncation by a mail client should still get the reader most of the way.
    expect(readUrlState('#model=copernicus')).toEqual({ mode: 'copernicus' });
  });

  /**
   * `model=newton&type=circular` names two real things that cannot go together.
   * Keeping it would leave the mode buttons disagreeing with the map.
   */
  it('rejects an engine that does not belong to the named mode', () => {
    const state = readUrlState('#model=newton&type=circular');
    expect(state.mode).toBe('newton');
    expect(state.engineId).toBeUndefined();
  });

  it('accepts an engine that does belong to it', () => {
    const state = readUrlState('#model=ptolemy&type=ptolemaic-almagest');
    expect(state.engineId).toBe('ptolemaic-almagest');
  });
});

describe('the date', () => {
  it('is written as a calendar date, not a Julian Day', () => {
    // Exactness is worth trading for a URL that says what it means.
    const encoded = encodeUrlState({ julianDate: jdFromCalendar(1610, 1, 7) });
    expect(encoded).toContain('date=1610-01-07');
  });

  it('round-trips to the same day', () => {
    for (const [y, m, d] of [
      [1610, 1, 7],
      [1999, 12, 31],
      [2026, 7, 31],
      [2400, 1, 1],
    ] as const) {
      const jd = jdFromCalendar(y, m, d);
      const back = readUrlState(encodeUrlState({ julianDate: jd })).julianDate!;
      // Day resolution, so equality is to within a day rather than exact.
      expect(Math.abs(back - jd), `${y}-${m}-${d}`).toBeLessThan(1);
    }
  });

  it('rejects a date outside the range the engines are valid over', () => {
    // Beyond 1600–2400 the elements are extrapolation; no date beats a bad one.
    expect(readUrlState('#date=1200-01-01').julianDate).toBeUndefined();
    expect(readUrlState('#date=3000-01-01').julianDate).toBeUndefined();
  });

  it('rejects nonsense without disturbing the rest of the link', () => {
    const state = readUrlState('#date=yesterday&model=copernicus');
    expect(state.julianDate).toBeUndefined();
    expect(state.mode).toBe('copernicus');
  });

  it('moves the clock, not merely the mirrored field', () => {
    // Patching state.julianDate alone would leave the clock disagreeing, and
    // the next tick would quietly undo the jump.
    const store = new Store();
    const target = jdFromCalendar(1610, 1, 7);
    store.hydrate({ julianDate: target });

    expect(store.get().julianDate).toBeCloseTo(target, 6);
    expect(store.clock.julianDate).toBeCloseTo(target, 6);

    // And it survives the clock being advanced afterwards.
    store.play();
    store.tick(1);
    expect(store.get().julianDate).toBeGreaterThan(target);
    expect(store.get().julianDate).toBeLessThan(target + 2);
  });
});

describe('every field is optional', () => {
  it('encodes only what it is given', () => {
    expect(encodeUrlState({})).toBe('#');
    expect(encodeUrlState({ mode: 'newton' })).toBe('#model=newton');
  });

  it('reads each field independently of the others', () => {
    // Any one field on its own must work, since a link may be edited by hand.
    expect(readUrlState('#sphere=observer')).toEqual({ sphereCentre: 'observer' });
    expect(readUrlState('#observer=jupiter')).toEqual({ observationPoint: 'jupiter' });
    expect(readUrlState('#centre=mars')).toEqual({ frameOrigin: 'mars' });
    expect(readUrlState('#date=2026-07-31').julianDate).toBeDefined();
  });

  it('hydrates from an empty object without changing anything', () => {
    const store = new Store();
    const before = { ...store.get() };
    store.hydrate({});
    const after = store.get();

    expect(after.mode).toBe(before.mode);
    expect(after.engineId).toBe(before.engineId);
    expect(after.frameOrigin).toBe(before.frameOrigin);
    expect(after.observationPoint).toBe(before.observationPoint);
    expect(after.sphereCentre).toBe(before.sphereCentre);
    expect(after.julianDate).toBeCloseTo(before.julianDate, 9);
  });
});

describe('applying a link to the store', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store();
  });

  it('restores every field', () => {
    store.hydrate(FULL);
    const state = store.get();
    expect(state.mode).toBe('ptolemy');
    expect(state.engineId).toBe('ptolemaic-almagest');
    expect(state.frameOrigin).toBe('earth');
    expect(state.observationPoint).toBe('mars');
    expect(state.sphereCentre).toBe('observer');
  });

  it('leaves unmentioned fields alone', () => {
    store.setScaleMode('true');
    store.selectBody('saturn');
    store.hydrate({ mode: 'copernicus' });

    // A link carries an arrangement, not the reader's whole session.
    expect(store.get().scaleMode).toBe('true');
    expect(store.get().selectedBody).toBe('saturn');
  });

  it('reconciles an engine that the mode does not own', () => {
    // Belt and braces: the URL layer rejects this pair, but hydrate is also the
    // door a future preset or deep link would come through.
    store.hydrate({ mode: 'newton', engineId: 'ptolemaic-epicyclic' });
    expect(store.get().mode).toBe('newton');
    expect(store.get().engineId).toBe('nbody');
  });

  it('applies as one change, not a cascade', () => {
    // Applied with separate setters, setMode would reset the engine that the
    // next call was about to set, and subscribers would see a state that was
    // never asked for.
    const seen: string[] = [];
    store.subscribe((state) => seen.push(`${state.mode}/${state.engineId}`));
    store.hydrate({ mode: 'ptolemy', engineId: 'ptolemaic-reframe' });

    expect(seen).toEqual(['ptolemy/ptolemaic-reframe']);
  });

  it('drops a ghost that the incoming engine would duplicate', () => {
    store.setGhostEngine('circular');
    store.hydrate({ mode: 'copernicus' });
    expect(store.get().ghostEngineId).toBeNull();
  });
});
