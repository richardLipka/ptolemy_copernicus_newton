/**
 * Static registry of the nine modelled bodies plus the physical and orbital
 * constants every engine draws on.
 *
 * Orbital elements are JPL's Keplerian approximations valid 3000 BC – 3000 AD,
 * which comfortably covers the app's supported 1600–2400 range. The `b`, `c`,
 * `s`, `f` terms exist only for Jupiter and Saturn, where the great inequality
 * (their 5:2 near-resonance) needs correcting over long spans.
 */

export type BodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'jupiter'
  | 'saturn';

export const BODY_IDS: readonly BodyId[] = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
] as const;

/** Gaussian gravitational constant squared: GM of the Sun in AU^3/day^2. */
export const GM_SUN = 2.959122082855911e-4;

export const AU_IN_KM = 149_597_870.7;

/**
 * Fraction of the Earth–Moon separation by which Earth is displaced from the
 * barycentre. The published elements track the barycentre, not Earth itself.
 */
export const MOON_TO_EMB_MASS_FRACTION = 0.0121505856;

/** Mean elements and their per-Julian-century rates. Angles in degrees, a in AU. */
export interface KeplerianElements {
  /** Semi-major axis, AU. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination to the ecliptic, degrees. */
  i: number;
  /** Mean longitude, degrees. */
  L: number;
  /** Longitude of perihelion, degrees. */
  peri: number;
  /** Longitude of the ascending node, degrees. */
  node: number;
}

export interface OrbitalModel {
  epoch: KeplerianElements;
  rates: KeplerianElements;
  /** Long-period corrections to mean anomaly; Jupiter and Saturn only. */
  correction?: { b: number; c: number; s: number; f: number };
}

export interface LocalizedName {
  /** Nominative — the default display form. */
  nominative: string;
  /** Genitive — needed by Czech event phrasing ("konjunkce Marsu a Jupiteru"). */
  genitive: string;
}

export interface Body {
  id: BodyId;
  /** What this body orbits in the classical two-body picture. */
  parent: BodyId | null;
  /** Mean radius, km. */
  radius: number;
  /** Gravitational parameter, AU^3/day^2 — used by the n-body engine. */
  gm: number;
  /** Visible to the unaided eye, and therefore known to ancient astronomers. */
  nakedEye: boolean;
  /** Counted among the seven classical "wandering stars". */
  classicalPlanet: boolean;
  names: { en: LocalizedName; cs: LocalizedName };
  /** Absent for the Sun (the origin) and the Moon (see lunar theory). */
  orbit?: OrbitalModel;
}

/** Sun-to-body mass ratios (IAU 2009), the source of each body's GM. */
const MASS_RATIO = {
  mercury: 6_023_600,
  venus: 408_523.71,
  earth: 332_946.0487,
  moon: 27_068_703.185,
  mars: 3_098_708,
  jupiter: 1047.3486,
  saturn: 3497.898,
} as const;

const gm = (ratio: number): number => GM_SUN / ratio;

export const BODIES: Record<BodyId, Body> = {
  sun: {
    id: 'sun',
    parent: null,
    radius: 695_700,
    gm: GM_SUN,
    nakedEye: true,
    classicalPlanet: true,
    names: {
      en: { nominative: 'Sun', genitive: 'the Sun' },
      cs: { nominative: 'Slunce', genitive: 'Slunce' },
    },
  },

  mercury: {
    id: 'mercury',
    parent: 'sun',
    radius: 2439.7,
    gm: gm(MASS_RATIO.mercury),
    nakedEye: true,
    classicalPlanet: true,
    names: {
      en: { nominative: 'Mercury', genitive: 'Mercury' },
      cs: { nominative: 'Merkur', genitive: 'Merkuru' },
    },
    orbit: {
      epoch: {
        a: 0.38709843,
        e: 0.20563661,
        i: 7.00559432,
        L: 252.25166724,
        peri: 77.45771895,
        node: 48.33961819,
      },
      rates: {
        a: 0.0,
        e: 0.00002123,
        i: -0.00590158,
        L: 149_472.67486623,
        peri: 0.15940013,
        node: -0.12214182,
      },
    },
  },

  venus: {
    id: 'venus',
    parent: 'sun',
    radius: 6051.8,
    gm: gm(MASS_RATIO.venus),
    nakedEye: true,
    classicalPlanet: true,
    names: {
      en: { nominative: 'Venus', genitive: 'Venus' },
      cs: { nominative: 'Venuše', genitive: 'Venuše' },
    },
    orbit: {
      epoch: {
        a: 0.72332102,
        e: 0.00676399,
        i: 3.39777545,
        L: 181.9797085,
        peri: 131.76755713,
        node: 76.67261496,
      },
      rates: {
        a: -0.00000026,
        e: -0.00005107,
        i: 0.00043494,
        L: 58_517.8156026,
        peri: 0.05679648,
        node: -0.27274174,
      },
    },
  },

  // Elements describe the Earth–Moon barycentre; the engine offsets Earth from
  // it using the Moon's geocentric position.
  earth: {
    id: 'earth',
    parent: 'sun',
    radius: 6371.0,
    gm: gm(MASS_RATIO.earth),
    nakedEye: false,
    classicalPlanet: false,
    names: {
      en: { nominative: 'Earth', genitive: 'Earth' },
      cs: { nominative: 'Země', genitive: 'Země' },
    },
    orbit: {
      epoch: {
        a: 1.00000018,
        e: 0.01673163,
        i: -0.00054346,
        L: 100.46691572,
        peri: 102.93005885,
        node: -5.11260389,
      },
      rates: {
        a: -0.00000003,
        e: -0.00003661,
        i: -0.01337178,
        L: 35_999.37306329,
        peri: 0.3179526,
        node: -0.24123856,
      },
    },
  },

  moon: {
    id: 'moon',
    parent: 'earth',
    radius: 1737.4,
    gm: gm(MASS_RATIO.moon),
    nakedEye: true,
    classicalPlanet: true,
    names: {
      en: { nominative: 'Moon', genitive: 'the Moon' },
      cs: { nominative: 'Měsíc', genitive: 'Měsíce' },
    },
  },

  mars: {
    id: 'mars',
    parent: 'sun',
    radius: 3389.5,
    gm: gm(MASS_RATIO.mars),
    nakedEye: true,
    classicalPlanet: true,
    names: {
      en: { nominative: 'Mars', genitive: 'Mars' },
      cs: { nominative: 'Mars', genitive: 'Marsu' },
    },
    orbit: {
      epoch: {
        a: 1.52371243,
        e: 0.09336511,
        i: 1.85181869,
        L: -4.56813164,
        peri: -23.91744784,
        node: 49.71320984,
      },
      rates: {
        a: 0.00000097,
        e: 0.00009149,
        i: -0.00724757,
        L: 19_140.29934243,
        peri: 0.45223625,
        node: -0.26852431,
      },
    },
  },

  jupiter: {
    id: 'jupiter',
    parent: 'sun',
    radius: 69_911,
    gm: gm(MASS_RATIO.jupiter),
    nakedEye: true,
    classicalPlanet: true,
    names: {
      en: { nominative: 'Jupiter', genitive: 'Jupiter' },
      cs: { nominative: 'Jupiter', genitive: 'Jupiteru' },
    },
    orbit: {
      epoch: {
        a: 5.20248019,
        e: 0.0485359,
        i: 1.29861416,
        L: 34.33479152,
        peri: 14.27495244,
        node: 100.29282654,
      },
      rates: {
        a: -0.00002864,
        e: 0.00018026,
        i: -0.00322699,
        L: 3034.90371757,
        peri: 0.18199196,
        node: 0.13024619,
      },
      correction: { b: -0.00012452, c: 0.0606406, s: -0.35635438, f: 38.35125 },
    },
  },

  saturn: {
    id: 'saturn',
    parent: 'sun',
    radius: 58_232,
    gm: gm(MASS_RATIO.saturn),
    nakedEye: true,
    classicalPlanet: true,
    names: {
      en: { nominative: 'Saturn', genitive: 'Saturn' },
      cs: { nominative: 'Saturn', genitive: 'Saturnu' },
    },
    orbit: {
      epoch: {
        a: 9.54149883,
        e: 0.05550825,
        i: 2.49424102,
        L: 50.07571329,
        peri: 92.86136063,
        node: 113.63998702,
      },
      rates: {
        a: -0.00003065,
        e: -0.00032044,
        i: 0.00451969,
        L: 1222.11494724,
        peri: 0.54179478,
        node: -0.25015002,
      },
      correction: { b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125 },
    },
  },
};

export const getBody = (id: BodyId): Body => BODIES[id];

/** Bodies with heliocentric Keplerian elements — everything but Sun and Moon. */
export const ORBITING_BODY_IDS = BODY_IDS.filter(
  (id) => BODIES[id].orbit !== undefined,
);
