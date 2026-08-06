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

## A note on parameters

The historical parameters — Ptolemy's apogees, eccentricities and epicycle
radii; Copernicus's 3/2 and 1/2 shares — are currently private constants inside
their engines, so an engine is a function of time alone. That is right for
running the models and wrong for *fitting* them: a tool that reconstructs the
circles from observations needs `positionsAt(jd, params)`.

`engines/ptolemaic.ts` already threads one parameter group through this way
(`MeanMotionSource`, with modern and *Almagest* instances), so the pattern
exists; extending it to the geometry is the next step.

## Tests

Run from the workspace root:

```bash
npm test
```

The suite checks the arithmetic against published values — Meeus's worked
examples, the *Almagest*'s own tables, measured synodic periods, Kepler's third
law inside the Jovian system and the Laplace resonance — rather than against
itself.
