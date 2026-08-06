/**
 * When a moon's name is worth printing.
 *
 * The gate used to be a magnification threshold, `zoom >= 3`, and that is wrong
 * in a way only measurement showed: zoom alone says nothing about how far apart
 * two bodies land. At 6x with Jupiter selected, Io sits 12.3 px from Jupiter on
 * the compressed scale and **0.2 px** away on the true one — same zoom, same
 * selection, and in the second case five labels stack into a smudge.
 *
 * These are the two measured configurations, in the units the renderer works in:
 * a point's distance times the zoom is its share of the map radius.
 */

import { describe, expect, it } from 'vitest';

import { labelHasRoom } from './orrery';

/** Separations measured from the running app at zoom 6, Jupiter selected. */
const COMPRESSED_IO = 0.0098; // 0.059 of the map radius once magnified
const TRUE_SCALE_IO = 0.00016; // 0.001 of the map radius — sub-pixel
const ORIGIN = { x: 0, y: 0 };

describe('labelHasRoom', () => {
  it('prints the name when the moon is visibly clear of its planet', () => {
    expect(labelHasRoom({ x: COMPRESSED_IO, y: 0 }, ORIGIN, 6)).toBe(true);
  });

  it('withholds it when the two are drawn on top of each other', () => {
    // The bug: this returned true, because zoom 6 cleared the old threshold of 3.
    expect(labelHasRoom({ x: TRUE_SCALE_IO, y: 0 }, ORIGIN, 6)).toBe(false);
  });

  it('is not fooled by magnification alone', () => {
    /*
     * The heart of it. Same zoom, same body, two scales — the answer must differ,
     * which a zoom threshold can never manage.
     */
    const zoom = 6;
    expect(labelHasRoom({ x: COMPRESSED_IO, y: 0 }, ORIGIN, zoom)).not.toBe(
      labelHasRoom({ x: TRUE_SCALE_IO, y: 0 }, ORIGIN, zoom),
    );
  });

  it('lets the name appear once true scale is magnified enough to earn it', () => {
    // True scale zooms to 1000x, and by then the lunar and Jovian systems are
    // genuinely open. The gate must not be a permanent ban on the honest scale.
    expect(labelHasRoom({ x: TRUE_SCALE_IO, y: 0 }, ORIGIN, 1000)).toBe(true);
  });

  it('measures in both axes, not just one', () => {
    const diagonal = COMPRESSED_IO / Math.SQRT2;
    expect(labelHasRoom({ x: diagonal, y: diagonal }, ORIGIN, 6)).toBe(true);
  });

  it('always prints for a body with no primary', () => {
    // Planets are not gated by this at all; only satellites reach it.
    expect(labelHasRoom({ x: 0, y: 0 }, null, 0.1)).toBe(true);
  });

  it('measures from the planet, not from the map centre', () => {
    /*
     * Jupiter is usually nowhere near the origin, and a moon sitting far from
     * the centre is not thereby far from *Jupiter*. Reading the distance from
     * the wrong point would print the names whenever the family drifted
     * outwards, which is most of the time.
     */
    const jupiter = { x: 0.8, y: -0.4 };
    const moonOnTop = { x: 0.8 + TRUE_SCALE_IO, y: -0.4 };
    expect(labelHasRoom(moonOnTop, jupiter, 6)).toBe(false);
    expect(labelHasRoom(moonOnTop, ORIGIN, 6)).toBe(true); // the wrong answer
  });
});
