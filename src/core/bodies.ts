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
  | 'saturn'
  // Satellites, added as a demonstration of orbits within orbits. See
  // SATELLITES below for what is and is not modelled about them.
  | 'io'
  | 'europa'
  | 'ganymede'
  | 'callisto'
  | 'titan';

export const BODY_IDS: readonly BodyId[] = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
  'io',
  'europa',
  'ganymede',
  'callisto',
  'titan',
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

/**
 * A satellite's orbit about its primary — mean elements, and no more.
 *
 * Deliberately crude. These bodies are here to show orbits within orbits, not to
 * predict an eclipse of Io, and the app makes no claim about their precision.
 * The *periods* are accurate, which is what the two demonstrations they exist
 * for actually need: Kepler's third law holds within the Jovian system to four
 * significant figures, and the Laplace resonance locks Io, Europa and Ganymede
 * into 1:2:4. The mean longitudes are approximate, so the phase of the system on
 * a given date is not to be trusted.
 *
 * Inclinations are referred to the ecliptic, since that is the plane the app
 * draws in. The Galileans sit nearly in it; Titan does not, because Saturn's
 * equator is tilted some 27° and its largest moon goes round with it.
 */
export interface SatelliteOrbit {
  /** Semi-major axis about the primary, AU. */
  a: number;
  e: number;
  /** Inclination to the ecliptic, degrees. */
  i: number;
  /** Longitude of the ascending node, degrees. */
  node: number;
  /** Longitude of pericentre, degrees. */
  peri: number;
  /** Mean longitude at J2000, degrees — approximate. */
  epochLongitude: number;
  /** Sidereal period, days. Accurate; the demonstrations rest on it. */
  periodDays: number;
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
  /** Present only for satellites, which orbit `parent` rather than the Sun. */
  satellite?: SatelliteOrbit;
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
  io: {
    id: 'io',
    parent: 'jupiter',
    radius: 1821.6,
    gm: gm(2.200e+10),
    // Galileo needed a telescope; nobody saw these with the naked eye.
    nakedEye: false,
    classicalPlanet: false,
    names: {
      en: { nominative: 'Io', genitive: 'Io' },
      cs: { nominative: 'Io', genitive: 'Io' },
    },
    satellite: {
      a: 421800.0 / AU_IN_KM,
      e: 0.0041,
      i: 2.21,
      node: 337.0,
      peri: 50.0,
      epochLongitude: 120.0,
      periodDays: 1.769138,
    },
  },
  europa: {
    id: 'europa',
    parent: 'jupiter',
    radius: 1560.8,
    gm: gm(3.300e+10),
    // Galileo needed a telescope; nobody saw these with the naked eye.
    nakedEye: false,
    classicalPlanet: false,
    names: {
      en: { nominative: 'Europa', genitive: 'Europa' },
      cs: { nominative: 'Europa', genitive: 'Europy' },
    },
    satellite: {
      a: 671100.0 / AU_IN_KM,
      e: 0.0094,
      i: 2.21,
      node: 337.0,
      peri: 130.0,
      epochLongitude: 250.0,
      periodDays: 3.551181,
    },
  },
  ganymede: {
    id: 'ganymede',
    parent: 'jupiter',
    radius: 2634.1,
    gm: gm(1.300e+10),
    // Galileo needed a telescope; nobody saw these with the naked eye.
    nakedEye: false,
    classicalPlanet: false,
    names: {
      en: { nominative: 'Ganymede', genitive: 'Ganymede' },
      cs: { nominative: 'Ganymed', genitive: 'Ganymeda' },
    },
    satellite: {
      a: 1070400.0 / AU_IN_KM,
      e: 0.0013,
      i: 2.21,
      node: 337.0,
      peri: 190.0,
      epochLongitude: 15.0,
      periodDays: 7.154553,
    },
  },
  callisto: {
    id: 'callisto',
    parent: 'jupiter',
    radius: 2410.3,
    gm: gm(1.900e+10),
    // Galileo needed a telescope; nobody saw these with the naked eye.
    nakedEye: false,
    classicalPlanet: false,
    names: {
      en: { nominative: 'Callisto', genitive: 'Callisto' },
      cs: { nominative: 'Kallisto', genitive: 'Kallisto' },
    },
    satellite: {
      a: 1882700.0 / AU_IN_KM,
      e: 0.0074,
      i: 2.21,
      node: 337.0,
      peri: 25.0,
      epochLongitude: 200.0,
      periodDays: 16.689018,
    },
  },
  titan: {
    id: 'titan',
    parent: 'saturn',
    radius: 2574.7,
    gm: gm(1.500e+10),
    // Galileo needed a telescope; nobody saw these with the naked eye.
    nakedEye: false,
    classicalPlanet: false,
    names: {
      en: { nominative: 'Titan', genitive: 'Titan' },
      cs: { nominative: 'Titan', genitive: 'Titanu' },
    },
    satellite: {
      a: 1221870.0 / AU_IN_KM,
      e: 0.0288,
      i: 26.73,
      node: 169.0,
      peri: 180.0,
      epochLongitude: 60.0,
      periodDays: 15.945421,
    },
  },
};


/** Bodies with heliocentric Keplerian elements — everything but Sun and Moon. */
export const ORBITING_BODY_IDS = BODY_IDS.filter(
  (id) => BODIES[id].orbit !== undefined,
);

/**
 * Bodies that take part in the gravitational simulation.
 *
 * **Not** the same as `BODY_IDS`, and the difference matters. The satellites are
 * excluded because the integrator's quarter-day step cannot resolve them: Io
 * goes round in 1.77 days, which is seven steps per orbit, and an orbit sampled
 * seven times does not close. Resolving it would need a step fifteen times
 * smaller and, with fourteen bodies instead of nine, would turn a 370 ms seek to
 * 1602 into something near fifteen seconds.
 *
 * They are placed as two-body riders on their primary instead — which is not a
 * dodge but Newton's own method. *Principia* Book III treats Jupiter's moons
 * exactly so, and that is how he weighed Jupiter.
 */
export const GRAVITATING_BODY_IDS = BODY_IDS.filter(
  (id) => BODIES[id].satellite === undefined,
);

/** Bodies that orbit a planet rather than the Sun. */
export const SATELLITE_IDS = BODY_IDS.filter(
  (id) => BODIES[id].satellite !== undefined,
);
