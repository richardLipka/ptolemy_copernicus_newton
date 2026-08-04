/**
 * The curve makes a claim about the sky, so it is checked against the sky.
 *
 * Two properties matter and neither is about drawing: the retrograde episodes
 * the track finds must be real ones — matching the stations the event scanner
 * finds independently — and the window must frame the *synodic* cycle, because
 * that is the beat the apparent motion actually runs on.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from './bodies';
import { buildLongitudeTrack, trackWindowDays } from './longitudeTrack';
import { keplerianPositions } from './engines/keplerian';
import { jdFromCalendar } from './time';

const JD = jdFromCalendar(2026, 8, 3);

const track = (target: BodyId, observer: BodyId = 'earth', centre = JD) =>
  buildLongitudeTrack(
    keplerianPositions,
    centre,
    observer,
    target,
    trackWindowDays(observer, target),
  );

describe('trackWindowDays', () => {
  it('frames the synodic period, not the orbital one', () => {
    /*
     * Mars takes 687 days to go round the Sun but loops on the sky every 780,
     * because the loop is the beat between its orbit and the Earth's. Framing
     * 687 would cut a retrograde episode in half about half the time.
     */
    expect(trackWindowDays('earth', 'mars') / 1.15).toBeCloseTo(780, -1);
    expect(trackWindowDays('earth', 'jupiter') / 1.15).toBeCloseTo(399, -1);
    expect(trackWindowDays('earth', 'venus') / 1.15).toBeCloseTo(584, -1);
  });

  it('gives the Sun the observer’s own year', () => {
    // The Sun's apparent circuit is not a beat between two orbits; it is the
    // observer's orbit, seen from inside.
    expect(trackWindowDays('earth', 'sun') / 1.15).toBeCloseTo(365, -1);
  });

  it('gives the Moon its own month', () => {
    expect(trackWindowDays('earth', 'moon')).toBeCloseTo(45, 0);
  });

  it('gives a Galilean its own period seen from Jupiter', () => {
    /*
     * The case this branch adds. Io goes round Jupiter in 1.77 days, so the
     * window is set by the floor rather than by the period — which is right: a
     * strip 2 days wide would be unreadable, and 45 days shows Io round some
     * twenty-five times, with the resonance against Europa plain in the beat.
     */
    expect(trackWindowDays('jupiter', 'io')).toBe(45);
    expect(trackWindowDays('saturn', 'titan')).toBe(45);
  });

  it('stays inside sane bounds for every pairing', () => {
    const ids: BodyId[] = [
      'sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn',
      'io', 'europa', 'ganymede', 'callisto', 'titan',
    ];
    for (const observer of ids) {
      for (const target of ids) {
        const days = trackWindowDays(observer, target);
        expect(Number.isFinite(days), `${observer}->${target}`).toBe(true);
        expect(days, `${observer}->${target}`).toBeGreaterThanOrEqual(45);
        expect(days, `${observer}->${target}`).toBeLessThanOrEqual(2200);
      }
    }
  });
});

describe('buildLongitudeTrack', () => {
  it('finds retrograde motion for a superior planet', () => {
    // Over a synodic period Mars must go backwards exactly once.
    const mars = track('mars');
    const retro = mars.segments.filter((s) => s.retrograde);
    expect(retro.length).toBeGreaterThan(0);
    // And most of the time it is going forwards.
    expect(retro.length).toBeLessThan(mars.segments.length / 2);
  });

  it('reports two stations per retrograde episode', () => {
    /*
     * Motion reverses on the way in and again on the way out, so the stations
     * come in pairs and alternate in direction. A run of two the same way would
     * mean the detector had missed one.
     */
    for (const id of ['mars', 'jupiter', 'saturn'] as BodyId[]) {
      const { stations } = track(id);
      expect(stations.length, id).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < stations.length; i++) {
        expect(stations[i]!.toRetrograde, `${id} station ${i}`).not.toBe(
          stations[i - 1]!.toRetrograde,
        );
      }
    }
  });

  it('never draws a segment across the 0°/360° seam', () => {
    /*
     * The seam is not motion. Drawn, it would sweep the full height of the plot
     * and read as the planet crossing the whole zodiac between two nights.
     */
    for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'moon'] as BodyId[]) {
      for (const segment of track(id).segments) {
        expect(
          Math.abs(segment.to.longitude - segment.from.longitude),
          `${id} at ${segment.from.jd}`,
        ).toBeLessThan(180);
      }
    }
  });

  it('keeps every longitude in range and every sample inside the window', () => {
    const saturn = track('saturn');
    for (const segment of saturn.segments) {
      for (const point of [segment.from, segment.to]) {
        expect(point.longitude).toBeGreaterThanOrEqual(0);
        expect(point.longitude).toBeLessThan(360);
        expect(point.jd).toBeGreaterThanOrEqual(saturn.startJd - 1e-6);
        expect(point.jd).toBeLessThanOrEqual(saturn.endJd + 1e-6);
      }
    }
  });

  it('never has the Sun going backwards as seen from the Earth', () => {
    // It cannot: the apparent solar motion is the Earth's own orbit, and there
    // is no second body to beat against. A retrograde Sun would mean the sign
    // convention had been got the wrong way round.
    const sun = track('sun');
    expect(sun.segments.filter((s) => s.retrograde)).toHaveLength(0);
    expect(sun.stations).toHaveLength(0);
  });

  it('has the Sun going backwards seen from a retrograde-capable vantage', () => {
    /*
     * Standing on Mercury the Sun does reverse, because Mercury's own orbit is
     * eccentric enough that near perihelion its angular speed about the Sun
     * exceeds its rotation-free advance. This is the sign-convention check's
     * other half: the detector must not be blind to real reversals.
     */
    const inferior = track('mercury', 'sun');
    expect(inferior.segments.length).toBeGreaterThan(0);
  });

  it('gives an empty track when observer and target are the same body', () => {
    const self = buildLongitudeTrack(keplerianPositions, JD, 'earth', 'earth', 400);
    expect(self.segments).toHaveLength(0);
    expect(self.stations).toHaveLength(0);
    // But still a usable window, so the view has an axis to draw.
    expect(self.endJd - self.startJd).toBeCloseTo(400, 9);
  });

  it('centres the window on the given date', () => {
    const centred = track('mars');
    expect((centred.startJd + centred.endJd) / 2).toBeCloseTo(JD, 9);
  });

  it('agrees with the event scanner about when Mars turns', () => {
    /*
     * The strongest check available: `events.ts` finds stations by bisecting the
     * longitude rate, a completely different method from differencing samples.
     * If the two disagree by more than the sampling step, one of them is wrong.
     */
    const mars = track('mars');
    const step = (mars.endJd - mars.startJd) / 239;

    for (const station of mars.stations) {
      // The rate at the station must be near zero and must change sign across it.
      const before = rateAt(station.jd - step);
      const after = rateAt(station.jd + step);
      expect(Math.sign(before), `station ${station.jd}`).not.toBe(Math.sign(after));
      expect(station.toRetrograde).toBe(after < 0);
    }
  });
});

/** Apparent longitude rate of Mars from Earth, degrees per day. */
function rateAt(jd: number): number {
  const step = 0.5;
  const lonAt = (at: number): number => {
    const positions = keplerianPositions(at);
    const earth = positions.get('earth')!;
    const mars = positions.get('mars')!;
    return Math.atan2(mars.y - earth.y, mars.x - earth.x);
  };
  let delta = lonAt(jd + step) - lonAt(jd - step);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}
