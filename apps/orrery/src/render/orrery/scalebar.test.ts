/**
 * The scale bar makes a numerical claim about the map, so the arithmetic behind
 * it is worth pinning: a bar that reads "1 AU" while spanning 1.4 is worse than
 * no bar at all.
 */

import { describe, expect, it } from 'vitest';

import { KM_PER_AU, chooseScaleBar } from './scalebar';

/**
 * Pixels per AU at the magnifications that matter.
 *
 * The map is 17.5 AU to its radius and a typical field gives ~223 px to that
 * radius, so pxPerAu is about 12.7 × zoom.
 */
const PX_PER_AU_AT_ZOOM_1 = 223 / 17.5;

describe('chooseScaleBar', () => {
  it('never draws a bar longer than asked for', () => {
    // Rounding is downward, always: the bar shortens to fit a round number
    // rather than the number growing to fit the bar.
    for (let zoom = 1; zoom <= 1000; zoom *= 1.7) {
      const bar = chooseScaleBar(PX_PER_AU_AT_ZOOM_1 * zoom, 180)!;
      expect(bar).not.toBeNull();
      expect(bar.lengthPx).toBeLessThanOrEqual(180);
    }
  });

  it('keeps the bar long enough to be worth drawing', () => {
    // Worst case for a 1-2-5 sequence is just under a doubling, so the bar can
    // never fall below 40% of the target. A stub would read as an error.
    for (let zoom = 1; zoom <= 1000; zoom *= 1.06) {
      const bar = chooseScaleBar(PX_PER_AU_AT_ZOOM_1 * zoom, 180)!;
      expect(bar.lengthPx).toBeGreaterThan(180 * 0.4);
    }
  });

  it('always states a round number', () => {
    const rounds = new Set([1, 2, 5]);
    for (let zoom = 1; zoom <= 1000; zoom *= 1.06) {
      const bar = chooseScaleBar(PX_PER_AU_AT_ZOOM_1 * zoom, 180)!;
      const mantissa = bar.value / 10 ** Math.floor(Math.log10(bar.value));
      expect(rounds.has(Math.round(mantissa))).toBe(true);
      expect(mantissa).toBeCloseTo(Math.round(mantissa), 9);
    }
  });

  it('says exactly what it spans', () => {
    // The claim the bar makes: its pixel length is its stated distance.
    const pxPerAu = PX_PER_AU_AT_ZOOM_1 * 40;
    const bar = chooseScaleBar(pxPerAu, 180)!;
    const spannedAu = bar.unit === 'au' ? bar.value : bar.value / KM_PER_AU;
    expect(spannedAu * pxPerAu).toBeCloseTo(bar.lengthPx, 9);
  });

  it('reads in AU across the planetary view', () => {
    // Fitted, the map spans Saturn's orbit; AU is the measure that view is in.
    // 180 px covers 14.1 AU here, so the bar reads 10 — about Saturn's distance,
    // which is the right order of magnitude for the fitted view.
    const bar = chooseScaleBar(PX_PER_AU_AT_ZOOM_1, 180)!;
    expect(bar.unit).toBe('au');
    expect(bar.value).toBe(10);
    expect(bar.fractionDigits).toBe(0);
  });

  it('switches to kilometres once the lunar orbit is in view', () => {
    /*
     * At true scale, zoom 1000 — the magnification the deep-zoom ceiling exists
     * for. In AU the honest reading here is 0.005, which tells a reader nothing;
     * in kilometres it is a number they can compare to the Moon's 384 400.
     */
    const bar = chooseScaleBar(PX_PER_AU_AT_ZOOM_1 * 1000, 180)!;
    expect(bar.unit).toBe('km');
    expect(bar.value).toBeGreaterThan(100_000);
    expect(bar.value).toBeLessThan(10_000_000);
  });

  it('gives a decimal only where one is needed', () => {
    // 0.5 AU must not print as "1 AU", and 500 000 km must not print as
    // "500 000.0 km".
    const half = chooseScaleBar(180 / 0.5, 180)!;
    expect(half.value).toBe(0.5);
    expect(half.fractionDigits).toBe(1);

    const five = chooseScaleBar(180 / 5, 180)!;
    expect(five.value).toBe(5);
    expect(five.fractionDigits).toBe(0);
  });

  it('holds the AU floor at a tenth of an AU', () => {
    // Just above the threshold stays in AU; just below crosses to kilometres.
    expect(chooseScaleBar(180 / 0.11, 180)!.unit).toBe('au');
    expect(chooseScaleBar(180 / 0.09, 180)!.unit).toBe('km');
  });

  it('returns nothing rather than a NaN when there is no sane bar', () => {
    // A collapsed field or an unmeasured layout must hide the bar, not print
    // "NaN AU" across the bottom of the map.
    expect(chooseScaleBar(0, 180)).toBeNull();
    expect(chooseScaleBar(-5, 180)).toBeNull();
    expect(chooseScaleBar(Number.NaN, 180)).toBeNull();
    expect(chooseScaleBar(Number.POSITIVE_INFINITY, 180)).toBeNull();
    expect(chooseScaleBar(12, 0)).toBeNull();
    expect(chooseScaleBar(12, Number.NaN)).toBeNull();
  });
});
