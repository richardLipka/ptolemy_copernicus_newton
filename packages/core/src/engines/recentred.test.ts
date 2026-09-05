import { describe, expect, it } from 'vitest';

import { BODIES, type BodyId } from '../bodies.js';
import { recentredConstruction, recentredEndpoint } from './recentred.js';
import { copernicanPositions } from './copernican.js';
import { keplerianPositions, heliocentricAt } from './keplerian.js';
import { recenter } from '../frame.js';
import { sub, type Vec3 } from '../vec.js';

const J2000 = 2451545;
const PLANETS: BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const DATES = [J2000, J2000 + 1234, J2000 - 5678, J2000 + 20_000];

const norm = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

describe('recentred harness', () => {
  /*
   * The one claim the overlay makes: it is a picture of the engine's own
   * subtraction, not a second model drawn beside it. If the chain ended
   * anywhere but on the body the engine placed, the figure would be arguing for
   * something the app does not compute.
   */
  it('ends exactly on the body the Keplerian engine placed', () => {
    for (const jd of DATES) {
      for (const body of PLANETS) {
        const end = recentredEndpoint(jd, body, 'earth', 'kepler')!;
        expect(norm(sub(end, heliocentricAt(jd, body)))).toBeLessThan(1e-12);
      }
    }
  });

  it('ends exactly on the body the Copernican engine placed', () => {
    for (const jd of DATES) {
      const positions = copernicanPositions(jd);
      for (const body of PLANETS) {
        const end = recentredEndpoint(jd, body, 'earth', 'copernican')!;
        expect(norm(sub(end, positions.get(body)!))).toBeLessThan(1e-12);
      }
    }
  });

  /*
   * And it works from any stationary body, not only the Earth — the frame
   * origin is free in every mode, so the overlay has to be too.
   */
  it('works from an origin other than the Earth', () => {
    for (const origin of PLANETS) {
      for (const body of PLANETS) {
        if (body === origin) continue;
        const end = recentredEndpoint(J2000, body, origin, 'kepler')!;
        expect(norm(sub(end, heliocentricAt(J2000, body)))).toBeLessThan(1e-12);
      }
    }
  });

  /*
   * The chain has to start on the stationary body, or the view's own recentring
   * would land the figure somewhere off the middle of the map.
   */
  it('starts on the stationary body', () => {
    const harness = recentredConstruction(J2000, 'mars', 'earth', 'kepler')!;
    const first = harness.construction.arms.find((a) => a.role === 'deferent-arm')!;
    const deferent = harness.construction.ellipses!.find((e) => e.role === 'deferent')!;
    // Focus + (centre → focus) reversed: the anchor is the ellipse's occupied
    // focus, which is the stationary body itself.
    const focus = sub(deferent.centre, sub(deferent.centre, first.from));
    expect(norm(sub(focus, first.from))).toBeLessThan(1e-12);
  });

  /*
   * The larger orbit leads. That single rule is what makes the figure come out
   * as Ptolemy drew it for both classes of planet, so it is worth pinning.
   */
  it('gives the deferent to the larger orbit, which reproduces the Almagest split', () => {
    const venus = recentredConstruction(J2000, 'venus', 'earth', 'kepler')!;
    expect(venus.deferentBody).toBe('earth');
    expect(venus.epicycleBody).toBe('venus');
    // An inferior planet's epicycle centre is the Sun, exactly as in Ptolemy.
    expect(venus.jointIsSun).toBe(true);

    for (const body of ['mars', 'jupiter', 'saturn'] as BodyId[]) {
      const harness = recentredConstruction(J2000, body, 'earth', 'kepler')!;
      expect(harness.deferentBody).toBe(body);
      expect(harness.epicycleBody).toBe('earth');
      // A superior planet's epicycle is the Earth's orbit, and its centre is a
      // construction point with nothing at it.
      expect(harness.jointIsSun).toBe(false);
    }
  });

  it('puts the joint on the Sun whenever the origin leads', () => {
    // Earth held still, Venus selected: the joint is the Sun's own position.
    const harness = recentredConstruction(J2000, 'venus', 'earth', 'kepler')!;
    expect(harness.jointIsSun).toBe(true);
    const joint = harness.construction.arms.find((a) => a.role === 'epicycle-arm')!.from;
    expect(norm(joint)).toBeLessThan(1e-12); // the Sun is the coordinate origin
  });

  it('declines the cases where the picture would be a lie', () => {
    expect(recentredConstruction(J2000, 'mars', 'sun', 'kepler')).toBeNull();
    expect(recentredConstruction(J2000, 'sun', 'earth', 'kepler')).toBeNull();
    expect(recentredConstruction(J2000, 'mars', 'mars', 'kepler')).toBeNull();
    // The Moon has no heliocentric orbit of its own to contribute a leg.
    expect(BODIES.moon.orbit).toBeUndefined();
    expect(recentredConstruction(J2000, 'moon', 'earth', 'kepler')).toBeNull();
  });

  /*
   * Changing the stationary point must not change where anything is. The
   * overlay is drawn from the same elements the engine uses, so this is really
   * a check that nothing in it writes back — but that is exactly the promise
   * being made to the reader.
   */
  it('leaves the engine`s positions untouched', () => {
    const before = recenter(keplerianPositions(J2000), 'earth').get('mars')!;
    recentredConstruction(J2000, 'mars', 'earth', 'kepler');
    recentredConstruction(J2000, 'venus', 'earth', 'copernican');
    const after = recenter(keplerianPositions(J2000), 'earth').get('mars')!;
    expect(norm(sub(before, after))).toBe(0);
  });
});
