/**
 * The shareable configuration.
 *
 * A link may be hand-edited, truncated by a mail client, or written against an
 * older version of the app. None of those may produce a broken screen, so every
 * field is validated on its own and a bad one is dropped rather than trusted.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { Store } from './store';
import { encodeUrlState, readUrlState, type UrlState } from './urlState';

const FULL: UrlState = {
  mode: 'ptolemy',
  engineId: 'ptolemaic-almagest',
  frameOrigin: 'earth',
  observationPoint: 'mars',
  sphereCentre: 'observer',
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
