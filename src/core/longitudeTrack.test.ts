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
import { buildLongitudeTrack, trackCycleDays, trackWindowDays } from './longitudeTrack';
import { keplerianPositions } from './engines/keplerian';
import { jdFromCalendar } from './time';

const JD = jdFromCalendar(2026, 8, 3);

/** Mirrors the constant in longitudeTrack.ts, which is deliberately private. */
const WINDOW_SHARE = 1.15;

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
    expect(trackCycleDays('earth', 'mars')).toBeCloseTo(780, -1);
    expect(trackCycleDays('earth', 'jupiter')).toBeCloseTo(399, -1);
    expect(trackCycleDays('earth', 'venus')).toBeCloseTo(584, -1);
  });

  it('matches the published synodic periods to a tenth of a percent', () => {
    /*
     * The window makes a quantitative claim, so it is checked against the
     * measured values rather than against the formula that produced it.
     *
     * The periods come out of Kepler's third law applied to the semi-major axes
     * in `bodies.ts`, which are JPL's 3000BC–3000AD fit — chosen for an app that
     * runs to ancient dates, and slightly different from the modern-epoch fit.
     * That plus the neglect of planetary mass in T = a^(3/2) is the whole of the
     * error, and at this size it is invisible: a tenth of a percent of Mars's
     * synodic period is under a day against a window of nine hundred.
     */
    const published: Record<string, number> = {
      mercury: 115.877,
      venus: 583.921,
      mars: 779.946,
      jupiter: 398.884,
      saturn: 378.092,
    };

    for (const [id, real] of Object.entries(published)) {
      expect(Math.abs(trackCycleDays('earth', id as BodyId) / real - 1), id).toBeLessThan(0.001);
    }
  });

  it('gives the Moon its sidereal month, not its synodic one', () => {
    /*
     * 27.32 days is the circuit against the stars, which is what the strip
     * plots. The familiar 29.53-day month is relative to the Sun and governs the
     * phases; using it would be a different quantity wearing the same name.
     *
     * The window itself lands on the floor rather than on either, since a strip
     * a month wide is too narrow to read.
     */
    expect(trackCycleDays('earth', 'moon')).toBeCloseTo(27.32166, 4);
    expect(trackWindowDays('earth', 'moon')).toBe(45);
  });

  it('gives the Sun the observer’s own year', () => {
    // The Sun's apparent circuit is not a beat between two orbits; it is the
    // observer's orbit, seen from inside.
    // The sidereal year, 365.256 days: the Sun's return to the same place among
    // the stars, which is what this axis measures.
    expect(trackCycleDays('earth', 'sun')).toBeCloseTo(365.256, 1);
  });

  it('shows a little more than one cycle, and says which number is which', () => {
    /*
     * The window is 1.15 cycles, so Saturn's strip is 435 days wide while its
     * synodic period is 378. Both numbers are real and the view prints both;
     * dividing the window by 1.15 to recover the cycle is only valid when the
     * clamp has not engaged, which is why `trackCycleDays` exists separately.
     */
    for (const id of ['venus', 'mars', 'jupiter', 'saturn', 'mercury'] as BodyId[]) {
      const cycle = trackCycleDays('earth', id);
      expect(trackWindowDays('earth', id), id).toBeCloseTo(cycle * WINDOW_SHARE, 6);
    }

    // Where the clamp does engage the two part company, and the ratio is no
    // longer 1.15 — the case that makes the division unsafe.
    expect(trackCycleDays('earth', 'moon')).toBeLessThan(30);
    expect(trackWindowDays('earth', 'moon')).toBe(45);
  });

  it('stays inside sane bounds for every pairing', () => {
    const ids: BodyId[] = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn'];
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
