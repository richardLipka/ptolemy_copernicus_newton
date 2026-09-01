/**
 * The zodiac, in both senses of the word.
 *
 * `signs` are the twelve equal 30-degree divisions Ptolemy used, measured from
 * the vernal equinox *of the date*. `constellations` are the actual star
 * patterns, which are uneven, number thirteen once Ophiuchus is counted, and
 * sit fixed against the stars.
 *
 * The two schemes agreed when the signs were named, around two thousand years
 * ago, and have been drifting apart ever since at about one degree per
 * seventy-two years. Offering both is what lets the app show precession: run
 * the clock across the supported range and a body's sign and its constellation
 * separate by a third of a sign.
 */

import { normalizeDeg } from './vec.js';
import { centuriesSinceJ2000 } from './time.js';

export type ZodiacScheme = 'signs' | 'constellations';

export interface ZodiacDivision {
  id: string;
  /** Start of the division in the relevant frame, degrees. */
  start: number;
  /** End of the division, degrees. May wrap past 360. */
  end: number;
}

/** The twelve equal signs, measured from the equinox of date. */
export const SIGNS: readonly ZodiacDivision[] = [
  { id: 'aries', start: 0, end: 30 },
  { id: 'taurus', start: 30, end: 60 },
  { id: 'gemini', start: 60, end: 90 },
  { id: 'cancer', start: 90, end: 120 },
  { id: 'leo', start: 120, end: 150 },
  { id: 'virgo', start: 150, end: 180 },
  { id: 'libra', start: 180, end: 210 },
  { id: 'scorpio', start: 210, end: 240 },
  { id: 'sagittarius', start: 240, end: 270 },
  { id: 'capricorn', start: 270, end: 300 },
  { id: 'aquarius', start: 300, end: 330 },
  { id: 'pisces', start: 330, end: 360 },
];

/**
 * Where the IAU constellation boundaries cross the ecliptic, in J2000
 * longitude. Ophiuchus is included because the ecliptic genuinely passes
 * through it, however inconvenient that is for the twelve-sign scheme.
 */
export const CONSTELLATIONS: readonly ZodiacDivision[] = [
  { id: 'pisces', start: 351.6, end: 388.7 },
  { id: 'aries', start: 28.7, end: 53.5 },
  { id: 'taurus', start: 53.5, end: 90.4 },
  { id: 'gemini', start: 90.4, end: 118.3 },
  { id: 'cancer', start: 118.3, end: 138.2 },
  { id: 'leo', start: 138.2, end: 174.0 },
  { id: 'virgo', start: 174.0, end: 217.8 },
  { id: 'libra', start: 217.8, end: 241.1 },
  { id: 'scorpius', start: 241.1, end: 247.7 },
  { id: 'ophiuchus', start: 247.7, end: 266.6 },
  { id: 'sagittarius', start: 266.6, end: 299.7 },
  { id: 'capricornus', start: 299.7, end: 327.6 },
  { id: 'aquarius', start: 327.6, end: 351.6 },
];

/**
 * General precession in longitude since J2000, degrees.
 *
 * Positions throughout the app are referred to the fixed J2000 ecliptic. The
 * tropical signs are not fixed — they are tied to the equinox, which moves.
 * Across 1600-2400 this amounts to eleven degrees, so ignoring it would put
 * bodies in the wrong sign for much of the supported range.
 */
export const precessionSinceJ2000 = (jd: number): number => {
  const t = centuriesSinceJ2000(jd);
  return 1.3969713 * t + 0.0003087 * t * t;
};

/** J2000 ecliptic longitude converted to tropical longitude of date. */
export const toTropicalLongitude = (longitudeJ2000: number, jd: number): number =>
  normalizeDeg(longitudeJ2000 + precessionSinceJ2000(jd));

const divisionContaining = (
  divisions: readonly ZodiacDivision[],
  longitude: number,
): ZodiacDivision => {
  const wrapped = normalizeDeg(longitude);
  for (const division of divisions) {
    const end = division.end > 360 ? division.end - 360 : division.end;
    const wraps = division.end > 360;
    if (wraps ? wrapped >= division.start || wrapped < end : wrapped >= division.start && wrapped < end) {
      return division;
    }
  }
  return divisions[0]!;
};

export interface ZodiacPosition {
  division: ZodiacDivision;
  /** Degrees into the division. */
  degreesInto: number;
}

/**
 * Locate a J2000 ecliptic longitude within the chosen scheme.
 *
 * The signs need the longitude precessed to the date; the constellations do
 * not, because they are fixed against the same stars the J2000 frame is.
 */
export function locate(
  longitudeJ2000: number,
  jd: number,
  scheme: ZodiacScheme,
): ZodiacPosition {
  const longitude =
    scheme === 'signs' ? toTropicalLongitude(longitudeJ2000, jd) : normalizeDeg(longitudeJ2000);

  const divisions = scheme === 'signs' ? SIGNS : CONSTELLATIONS;
  const division = divisionContaining(divisions, longitude);

  return {
    division,
    degreesInto: normalizeDeg(longitude - division.start),
  };
}

export const divisionsFor = (scheme: ZodiacScheme): readonly ZodiacDivision[] =>
  scheme === 'signs' ? SIGNS : CONSTELLATIONS;
