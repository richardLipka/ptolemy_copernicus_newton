# @orrery/core

The solar system, and four ways of accounting for it: Ptolemy's epicycles,
Copernicus's eccentrics, Kepler's ellipses and Newton's gravitation — each as a
function from a Julian date to a set of positions.

No DOM, no framework, no runtime dependencies. The package compiles without the
DOM lib, so a stray `document` reference is a compile error rather than
something a reviewer has to catch.

## Install

Inside this workspace it is already linked. From elsewhere, depend on the
repository directory or add it as a workspace.

Source is exported directly — both current consumers are Vite apps, which
transform TypeScript in linked workspace dependencies. Publishing to a registry
would need a build step emitting `.js` and `.d.ts`.

## Use

```ts
import { BODIES, jdFromCalendar, ENGINES } from '@orrery/core';

const jd = jdFromCalendar(2026, 8, 6);
const positions = ENGINES.keplerian.positionsAt(jd);
positions.get('mars');           // { x, y, z } in AU
```

**Every module is importable on its own**, and that is the point. A tool that
wants one model should not be made to load the others:

```ts
import { keplerianPositions }   from '@orrery/core/engines/keplerian';
import { ptolemaicGeometryFor } from '@orrery/core/engines/ptolemaic';
import { copernicanPositions }  from '@orrery/core/engines/copernican';
import { nbodyEngine }          from '@orrery/core/engines/nbody';
import { buildLongitudeTrack }  from '@orrery/core/longitudeTrack';
import { illuminationOf }       from '@orrery/core/illumination';
```

The subpath mirrors the file path. Measured, minified:

| import | bundle |
|---|---|
| `@orrery/core/engines/keplerian` | 13 kB |
| `@orrery/core/engines/registry` (all eight) | 168 kB |

`sideEffects: false` lets a bundler drop what you do not reach. Importing
`ENGINES` from the root entry, or `engines/registry` directly, is what pulls all
eight in at once.

## What it contains

| module | what it holds |
|---|---|
| `bodies` | the body table — elements, masses, radii, satellite orbits, names |
| `time` | Julian dates, the calendar, the simulation clock |
| `vec` | 3-vectors and angle helpers |
| `coordinates` | apparent longitude, elongation, spherical conversion |
| `frame` | recentring a position set on any body |
| `engines/keplerian` | two-body ellipses — the working reference |
| `engines/vsop87` | the accurate ephemeris everything is measured against |
| `engines/circular` | concentric circles: Copernicus simplified |
| `engines/copernican` | eccentric plus epicyclet, as *De revolutionibus* has it |
| `engines/ptolemaic` | deferent, eccentric, equant and epicycle, with *Almagest* parameters |
| `engines/nbody` | a symplectic integrator — Newton |
| `engines/registry` | all of the above by id |
| `events` | conjunctions, oppositions, stations, cross-model comparison |
| `longitudeTrack` | apparent longitude against time: what an observer records |
| `illumination` | phase and illuminated fraction |
| `zodiac` | signs and IAU constellations, with precession |
| `satellites` | the Moon, the Galileans and Titan |
| `construction` | the geometry each model uses to place a body, for drawing |

## Parameters are data

The historical values are one instance, not the only one. Ptolemy's apogees,
eccentricities and epicycle radii live in `ALMAGEST_PARAMETERS`; Copernicus's
3/2 and 1/2 in `COPERNICAN_PARAMETERS`; Kepler's in `KEPLERIAN_PARAMETERS`,
which is empty because his construction has no free device — the ellipse is the
whole of it, so what a reconstruction fits is the orbit. Pass a different set
and the identical geometry runs on it:

```ts
import {
  ALMAGEST_PARAMETERS,
  createPtolemaicEngine,
} from '@orrery/core/engines/ptolemaic';

const mine = structuredClone(ALMAGEST_PARAMETERS);
mine.planets.mars!.epicycleRadius = 41;      // my fit, not his

const engine = createPtolemaicEngine(mine);   // a normal Engine
```

`createPtolemaicEngine` and `createCopernicanEngine` return ordinary `Engine`
values, so a fitted set can be handed to everything that consumes one — the
longitude track, the event scanner, the construction harness, the model
comparison. A student's Mars and Ptolemy's Mars become the same kind of object
and can be drawn on the same axes.

Two details that matter for fitting:

- **The nested spheres are rebuilt from the parameters given.** The shells are
  chained out of the epicycle radii and eccentricities, so a fitted set gets the
  shell spacing that follows from its own numbers instead of inheriting his.
- **Bodies are independent.** Changing Mars leaves Venus exactly where it was,
  which is what makes fitting one body at a time — the way it is actually done —
  work at all.

### What a fit recovers

For a superior planet Ptolemy's ratio *r*/*R* equals 1/*a*, where *a* is the
heliocentric semi-major axis. So sweeping the epicycle radius against observed
longitudes measures how far Mars is from the Sun, in a model that denies the Sun
is the centre of anything. `parameters.test.ts` does exactly that sweep:

| | |
|---|---|
| fitted *r* | 39.34 parts of 60 |
| implied distance 60/*r* | 1.5252 AU |
| Mars's true *a* | 1.5237 AU |
| ratio | **1.0010** |

Ptolemy's own 39.5 sits within 0.4% of the best-fitting value. He had this
number, and it is a heliocentric distance.

## Tests

Run from the workspace root:

```bash
npm test
```

The suite checks the arithmetic against published values — Meeus's worked
examples, the *Almagest*'s own tables, measured synodic periods, Kepler's third
law inside the Jovian system and the Laplace resonance — rather than against
itself.
