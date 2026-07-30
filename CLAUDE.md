# Ptolemy — 2D Solar System Model (Ptolemy / Copernicus / Newton)

## 1. Purpose

An interactive, browser-based 2D model of the solar system (Sun, Mercury, Venus,
Earth, Moon, Mars, Jupiter, Saturn) whose **primary teaching goal** is to make the
differences and similarities between three historical/physical world-models
tangible:

- **Ptolemaic** — geocentric, deferents and epicycles
- **Copernican** — heliocentric, circular orbits
- **Newtonian** — gravitational n-body simulation, emergent elliptical orbits

The same sky, shown three ways. The user can pick an arbitrary body as the
stationary center and watch every orbit redraw around it, follow sight-lines out
to the zodiac to see apparent positions, and step through history to compare when
each model predicts conjunctions, oppositions, and retrograde loops.

Graphics are rendered with **CSS only** (positioning via CSS custom properties and
transforms on DOM elements — no `<canvas>`, no WebGL). Visual language targets the
**Newtonian-era orrery/brass-instrument aesthetic**. Localized in **Czech
(default) and English**.

---

## 2. Core Insight Driving the Architecture

Retrograde motion, conjunctions, and phases are not separate phenomena to
special-case per model — they are **the same physical reality viewed from
different reference frames**. The architecture keeps four concerns decoupled:

1. **Position engine** — how a body's true position over time is computed.
2. **Frame origin** — which body is pinned at the center of the drawing.
3. **Observation point** — which body the sight-lines to the zodiac emanate from.
4. **Projection** — how positions become CSS pixel offsets and zodiac angles.

Concerns 2 and 3 are **independent**. Copernicus mode centers the Sun but you
still observe from Earth; that gap between "where things are" and "where they
appear" is exactly the thing the app exists to teach. A "mode" is a **preset
bundle** of (engine, default frame origin, default observation point), not a
separate code path.

---

## 3. Decisions Locked

| Topic | Decision |
|---|---|
| Ptolemaic engine | **Both, toggleable**: Earth-fixed reframe of accurate positions *and* authentic Almagest epicycle reconstruction, as two sub-modes |
| Frame origin picker | **Free in all modes** — any body can be centered in any mode |
| Copernicus orbits | **Pure circles** — reproduces the historical error deliberately |
| Stack | **TypeScript + Vite, vanilla DOM**, no UI framework |
| Zodiac division | **Both, toggleable**: 12 equal 30° signs (default) and real IAU boundaries |
| Time range | **1600–2400**, opens at today's date |
| Events | **Auto-list + on-demand search**, with **all three models' predicted dates shown side by side** |
| Layout | **Map centered and dominant; celestial sphere as a ring around it; sight-lines from the observation point through each body out to the ring** |
| Default locale | **Czech**, English via toggle |
| Deployment | **Static files on a university web server** — no backend, no database, no server-side writes |
| Build order | **Core math first (unit-tested), then UI** |
| Radial scale | **Compressed by default, with a true-scale toggle** |
| Model overlay | **Ghost overlay** — a second model drawn faintly alongside the active one |
| Orbit paths | **Logged, never pre-computed** — a trail is a record of positions actually visited |
| Overlays | **Trails, construction, sight-lines and star figures each switch independently** |
| Sphere detail | **Bands plus engraved star figures** (principal stars joined by figure lines) |

---

## 4. Domain Model

### 4.1 Bodies
Static registry per body: id, display name (cs/en), physical radius, mass (needed
by the n-body engine), display color/size tokens, orbital parent (Sun for planets,
Earth for Moon), and classical-astronomy metadata (naked-eye visibility,
traditional "planet" status).

### 4.2 Time
One simulation clock shared by the entire app: current Julian Date, a time-scale
multiplier, play/pause/step, and jump-to-date. All engines are pure functions of
this clock, so switching modes mid-playback never jumps the calendar — essential
for apples-to-apples comparison.

### 4.3 Position Engines

Common interface, independent of frame and view:

```ts
interface Engine {
  positionsAt(jd: number): Map<BodyId, Vec3>;  // heliocentric, AU
}
```

Implementations:

- **`keplerianEngine`** — two-body Keplerian ellipses from standard orbital
  elements with secular rates. Serves as the accurate ground-truth ephemeris,
  the basis for Ptolemy's reframe sub-mode, and the reference against which the
  other engines' error is measured.
- **`circularEngine`** (Copernicus) — mean orbital radius and period per planet,
  perfect circles, Sun at center. Deliberately reproduces Copernicus's real
  error: heliocentrism right, circular orbits wrong. Divergence from
  `keplerianEngine` grows visibly with time and is *content*, not a bug — the UI
  may surface it as an error readout.
- **`nbodyEngine`** (Newton) — numerical integration of Newtonian gravity over
  Sun + 7 bodies + Moon. Orbits are emergent; ellipses, varying speed, and
  apsidal precession fall out of the force law rather than being prescribed.
  Integrator: velocity-Verlet or RK4 (see §11 on drift). Seeded from
  `keplerianEngine` state vectors at a reference epoch, then integrated forward
  or backward to the requested date.
- **`ptolemaicEngine`** — two sub-modes sharing one interface:
  - **`reframe`** — ground-truth positions expressed with Earth at the origin.
    Geometrically exact; retrograde loops appear with no epicycle math. This is
    "what Ptolemy was approximating."
  - **`epicyclic`** — authentic deferent + epicycle + eccentric + equant
    construction with Almagest-derived parameters. Orbit traces visibly differ
    in shape, and predicted positions carry Ptolemy's real historical error.
    This is "what Ptolemy actually built."

  Showing these two against each other is a first-class teaching feature: the
  epicycle machinery is revealed as a *good approximation of a real geometry*,
  not arbitrary medieval complication.

### 4.4 Frame Origin (stationary point)

A pure post-processing step applied to any engine's output:

```ts
recenter(positions: Map<BodyId, Vec3>, originId: BodyId): Map<BodyId, Vec3>
```

Free choice in every mode. Each mode has a default (Earth for Ptolemy, Sun for
Copernicus, Sun for Newton) and the picker is one shared component. Selecting a
non-canonical origin for a mode is allowed and unremarked in the math; the UI may
note it in the info panel where historically relevant.

### 4.5 Observation Point

Separate from the frame origin. Determines where sight-lines to the celestial
sphere originate and from which body apparent positions, phases, and events are
computed. Defaults to Earth in all modes (that is the historically meaningful
vantage), but is user-selectable — "what does the sky look like from Mars" is a
legitimate and instructive question.

Apparent ecliptic longitude of a body is always computed from the **observation
point**, never from the frame origin. Changing what is drawn at the center must
not change what the sky looks like.

### 4.6 Unified View Geometry

One composite view, not two panes:

- **Center**: the orbital plan view — frame origin pinned at the middle, orbit
  rings (individually toggleable), body markers.
- **Ring**: the celestial sphere as an annulus surrounding the map, divided into
  zodiac segments (equal signs or IAU boundaries), labelled, engraved-band
  styling.
- **Sight-lines**: from the observation point, through each body, extended to
  where it meets the ring — the body's apparent position. These lines are the
  visual bridge between true and apparent position, and make retrograde motion
  legible: the body moves steadily on the map while its ring intercept reverses.

Radial scaling is a real problem here (Mercury at 0.39 AU vs Saturn at 9.5 AU in
one bounded annulus) — see §12 Q2.

### 4.7 Illumination / Phases
From true Sun, body, and observation-point positions (always real geometry, never
the display frame): phase angle → illuminated fraction and terminator
orientation. On the map, every body is lit from the Sun's true direction. On
selection, a phase disc renders the body as seen from the observation point,
alongside basic info: name, type, distance from Sun and from the observation
point, current zodiac position, phase percentage.

### 4.8 Events
Detected by scanning apparent geocentric (observation-point) ecliptic longitudes
over time:
- **Conjunction** — two bodies' longitudes coincide.
- **Opposition** — a body's longitude is 180° from the Sun's.
- **Station / retrograde** — the rate of change of apparent longitude changes sign.

Method: coarse sampling to find sign changes or crossings, then bisection to
refine the timestamp to the desired precision.

**Cross-model comparison is first-class.** Every detected event is resolved
against all engines, so the UI can show: *Mars opposition — Newton: 1608-04-12,
Copernicus: 1608-04-09, Ptolemy (epicyclic): 1608-04-17*. The size of that spread
is the most direct quantitative answer to "how good were these models," and it is
the single highest-value feature for the app's stated purpose.

Both an auto-scanned list for the current time window and an on-demand "find next
conjunction of X and Y" search are provided.

---

## 5. Module Map

```
src/
  core/
    time.ts              # simulation clock, Julian Date conversions
    bodies.ts            # static body registry + physical/orbital constants
    vec.ts               # small vector math helpers
    engines/
      types.ts           # Engine interface, mode registry
      keplerian.ts       # ground-truth ellipses; basis for Ptolemy reframe
      circular.ts        # Copernicus: pure circles
      nbody.ts           # Newton: numerical gravity integrator
      ptolemaic.ts       # reframe + epicyclic sub-modes
    frame.ts             # recenter(positions, originId)
    coordinates.ts       # heliocentric <-> ecliptic longitude <-> apparent
    illumination.ts      # phase angle -> illuminated fraction / terminator
    events.ts            # scan + bisect; multi-engine comparison
    zodiac.ts            # longitude -> sign (equal) or constellation (IAU)

  state/
    store.ts             # mode, frame origin, observation point, selected body,
                         #   time, orbit toggles, zodiac scheme, locale
    selectors.ts         # derived: current positions, sight-lines, event window

  render/
    orrery/              # composite view: map + ring + sight-lines
      map.ts             # orbit rings, body markers
      sphere.ts          # zodiac annulus, segment labels
      sightlines.ts      # observation point -> body -> ring intercept
    body-marker/         # per-body element + illumination rendering
    info-panel/          # selected-body card
    event-panel/         # event list + search + cross-model comparison table
    theme/               # CSS custom-property tokens (orrery/brass skin)

  ui/
    controls/            # mode switch, frame origin, observation point,
                         #   time controls, orbit toggles, zodiac scheme, locale
    app-shell.ts

  i18n/
    cs.json              # default
    en.json
    i18n.ts

main.ts
index.html
```

Data flow, one tick:

```
time.ts (JD)
  -> engines[mode].positionsAt(jd)              # true positions
  -> frame.recenter(positions, frameOriginId)   # what goes where on the map
  -> coordinates.apparentLongitudes(positions, observationPointId)
                                                # what the sky looks like
  -> zodiac + illumination + events
  -> render/* writes CSS custom properties (--x, --y, --angle, --illum, ...)
     onto DOM nodes; CSS transforms and gradients do the drawing
```

`core/` is pure — no DOM, no globals, fully unit-testable. `render/` and `ui/`
are the only layers that touch the DOM.

---

## 6. Rendering Approach (CSS-only)

- Bodies positioned via `transform: translate(var(--x), var(--y))`, values
  written as CSS custom properties each tick — compositor-only, no layout
  thrashing.
- Orbit rings as DOM elements using `border-radius` + `aspect-ratio` (circles) or
  scaled/rotated wrappers (ellipses), toggled by class.
- Sight-lines as thin absolutely-positioned elements rotated by
  `--angle` and length-scaled — no SVG needed.
- Zodiac ring as 12 (or N) segments positioned by rotation around the annulus,
  labels counter-rotated to stay upright.
- Phase rendering via layered `radial-gradient` plus `clip-path` for the
  terminator.
- All visual constants as CSS custom-property tokens in `render/theme/` so the
  skin is swappable without touching render logic.

---

## 7. Deployment Constraints

Target is a **university web server serving static files**. Therefore:

- Build output is plain static assets — HTML, JS, CSS. No backend, no database,
  no server-side state, no build step required on the host.
- Vite configured with a **relative base path** so the app works from any
  subdirectory (`/~user/orrery/`) without reconfiguration.
- No filesystem or server writes of any kind. Locale and last-used settings may
  persist in `localStorage` (browser-local, per-visitor) and the app must
  function correctly when `localStorage` is unavailable or cleared.
- No external network requests at runtime — all ephemeris constants, fonts, and
  assets bundled. The app must work fully offline once loaded.

---

## 8. State & Mode Switching

Single source of truth in `state/store.ts`. Switching modes swaps the active
engine only — time, frame origin, observation point, selected body, zodiac
scheme, and orbit toggles all persist across the switch. This is deliberate: the
comparison is only meaningful if nothing else moves.

---

## 9. Localization

Flat key-based JSON dictionaries. **Czech is the default locale**; English via
toggle, preference persisted to `localStorage`. Everything user-visible is
localized: UI strings, body names, zodiac sign and constellation names, event
type names and descriptions, date formatting. Czech grammar needs care in a few
places (declension in phrases like "konjunkce Marsu a Jupiteru") — see §12 Q3.

---

## 10. Aesthetic Direction

17th–18th century orrery / brass scientific instrument: brass and warm metal
tones, parchment ground, fine engraved lines for orbit rings and the zodiac band,
serif display type for labels, restrained warm palette. Delivered entirely as CSS
custom-property tokens.

---

## 11. Risks / Watch-Items

- **N-body drift over an 800-year range (1600–2400)**: a naive integrator will
  visibly drift. Mitigation: RK4 or velocity-Verlet with an adequate step,
  integrated from a reference epoch, with results cached/checkpointed so
  scrubbing the timeline doesn't re-integrate from scratch. Accuracy against
  `keplerianEngine` should be asserted in tests at the range endpoints.
- **N-body performance while scrubbing**: integration is sequential, so
  jump-to-date is expensive. Checkpoint states at intervals across the supported
  range so any date is reachable by integrating from a nearby checkpoint.
- **Moon in the n-body engine**: the Earth-Moon mass ratio and short orbital
  period force a much smaller timestep than the planets need. May require
  sub-stepping the Moon or treating the Earth-Moon system specially.
- **Radial scale in a bounded annulus** — see §12 Q2.
- **CSS transform volume**: bodies + rings + sight-lines + zodiac segments all
  updating per frame. Should stay cheap (compositor-only) but warrants a check
  once the full view is live.

---

## 12. Implementation Notes and Known Simplifications

### 12.1 Where each engine's numbers come from

- **Keplerian (ground truth)** — JPL's approximate Keplerian elements valid
  3000 BC–3000 AD, including the `b/c/s/f` great-inequality terms for Jupiter
  and Saturn. The Moon uses a truncated Meeus lunar theory (27 longitude and
  distance terms, 29 latitude terms). Validated against Meeus's worked example
  47.a and against the recorded great conjunctions of 1603 and 1623, which it
  reproduces to the day.
- **Copernican** — mean radius, mean longitude, correct orbital plane, zero
  eccentricity.
- **Ptolemaic (epicyclic)** — Almagest apogees, eccentricities, and epicycle
  radii, shifted once into the star-fixed J2000 frame. Driven by modern mean
  longitudes rather than Ptolemy's own tables, so that what the engine shows is
  the error in his *geometry* rather than 1,900 years of accumulated tabular
  drift.
- **Newtonian** — Yoshida 4th-order symplectic integration at a quarter-day
  step, seeded from the reference ephemeris and checkpointed every five years.

### 12.2 The n-body seed needs calibrating

The reference ephemeris publishes *mean* elements — a smoothed fit, not an
instantaneous dynamical state. Seeding an integrator from them gives each body
slightly the wrong orbital energy, hence the wrong period, hence phase error
that grows without bound: uncorrected, Jupiter and Saturn reached their 1623
great conjunction two months early.

`core/engines/calibrate.ts` solves this the way real orbit determination does,
by differentially correcting the initial speeds until the secular drift
vanishes. The resulting seven constants live in `nbody.ts`. Re-run the
calibration if the reference elements or the integrator ever change.

Measured against the reference across 1600–2400, the corrected integration
holds every planet within **0.5°** and the Moon within **8°**.

### 12.3 Accuracy, and why it matters

Worst apparent-longitude error across 1600–2400:

| Body | Ptolemy | Copernicus | Newton |
|---|---|---|---|
| Sun | 0.5° | 0.3° | — |
| Mercury | 4.6° | 6.1° | <0.1° |
| Venus | 1.9° | 0.6° | <0.1° |
| Mars | 2.8° | 13.4° | <0.1° |
| Jupiter | 0.7° | 6.9° | 0.2° |
| Saturn | 2.5° | 6.3° | 0.5° |

Two things follow. First, Newton mode's own error is an order of magnitude
below the historical models', so cross-model comparisons measure the models
rather than the integrator. Second — and this is the app's most valuable single
result — **Ptolemy beats Copernicus** on the superior planets. *De
revolutionibus* was not more accurate than the *Almagest*; circular orbits cost
Copernicus more than geocentrism cost Ptolemy, and only Kepler's ellipses broke
the deadlock. `engines/accuracy.test.ts` asserts this so it cannot silently
regress.

### 12.4 Deliberate simplifications

- **Ptolemy's lunar crank is not implemented.** The engine uses the simple
  Hipparchan epicycle, which reproduces the 5° equation of centre at syzygy but
  not the evection. Ptolemy's correction for it famously made the Moon's
  distance vary nearly 2:1, predicting an apparent size change that plainly does
  not happen — a good teaching point, and a candidate for later work.
- **The nested spheres are not modelled, so Venus goes full.** Ptolemy's
  construction fixes *angles*, not distances; his published epicycle ratio lets
  Venus reach the far side of its epicycle and show a full disc. What actually
  forbade a full Venus was the nested-sphere cosmology wrapped around the
  construction, in which Venus's shell lay entirely inside the Sun's.

  So switching engines does **not** reproduce Galileo's observation, and the
  app must not claim it does — `core/venus-phases.test.ts` pins this down. The
  underlying point is sharper than the usual telling: the phases were decisive
  precisely because they attacked the one thing the geocentric longitude
  machinery could never speak to. Adding a nested-spheres distance constraint
  as a third Ptolemaic sub-mode would make this demonstrable, and is the single
  most valuable candidate for future work.
- **Ptolemy's latitude theory is not implemented.** The epicyclic engine places
  every body on the ecliptic. The app reads longitudes, so this is invisible
  except that Mercury's and Venus's latitudes are zero.
- **Mercury's Ptolemaic crank is omitted** — it uses the standard
  eccentric-plus-equant construction rather than his moving-deferent mechanism.
- **Positions are geometric.** No light-time, aberration, or nutation. The
  largest omitted effect is about 0.01°, against a 30°-wide zodiac sign.
- **Precession** is applied when mapping to tropical signs (11° across the
  supported range, so it cannot be ignored) but not to the underlying J2000
  frame.

## 13. UI Layer Notes

### 13.1 Ghost overlay

The user picks a comparison model; its bodies render faintly beside the active
model's. This is the app's headline feature and the render layer is built for
it: two position sets, one accurate and one historical, drawn in the same frame
so the Copernican 13° error on Mars is a visible gap rather than a figure in a
table.

### 13.2 Orbits are logged, never pre-computed

An orbit is drawn from `state/trails.ts`, a log of snapshots the simulation
genuinely passed through. Nothing is sampled ahead of the clock. A trail is
therefore evidence rather than prediction: it cannot show a shape the engine did
not produce, and an orbit that closes on itself has demonstrably closed rather
than been drawn closed.

Each past position is plotted against the frame origin **as it stood at that
moment**, not where the origin is now. That is what makes an Earth-centred Mars
accumulate the retrograde rosette — every point is geocentric for its own date,
exactly as an observer would have recorded it.

Consequences, all deliberate:

- **Nothing is drawn until the clock runs.** On load the map is bare. This is
  the honest cost of the approach and the UI says so rather than hiding it.
- **A full Saturn circuit needs 29 simulated years to elapse.** Run time fast
  and it accumulates; there is no shortcut, because a log has no future.
- **Whole snapshots are kept, not screen points**, so recentring the map or
  switching scale reprojects existing history instead of discarding it. Only a
  change of *engine* resets the log, since a trail belongs to one model.
- **A date jump resets it.** The bodies did not travel from where they were to
  where they now are, and a line joining the two would be a path nothing took.

Memory and the DOM are bounded by capacity (150 snapshots), and **decimation**
buys unbounded time coverage within that bound: on overflow every second sample
is dropped and the spacing doubles. Long histories are recorded more coarsely
than recent ones, which is the only alternative to either forgetting the past or
growing without limit.

The log records every `stepDays`, so its newest entry lags the body by up to one
step — obvious once the step has coarsened. The renderer closes that last gap
with a live segment from the final sample to the body's current position, or the
trail visibly detaches from the planet it belongs to.

### 13.3 The construction harness

Engines that place a body *geometrically* expose the machinery they used, not
just the answer, via an optional `construction()` on the `Engine` interface:
deferent and epicycle circles, the deferent's centre, the equant, the arms
joining them, and the apsidal axis. The view draws it for the selected body
under a **Konstrukce / Construction** toggle.

Only two engines have one. The Ptolemaic epicyclic engine gives the full
harness; the Copernican engine gives a circle and a radius arm, and that
spareness is itself the lesson — set beside deferent-plus-eccentric-plus-
equant-plus-epicycle, it is what made Copernicus feel like an enormous
simplification even though he predicted no better. The n-body integrator has no
construction, and the Earth-centred reframe borrows accurate positions rather
than deriving them, so both leave the method undefined and the toggle hides.

Two consequences worth knowing:

- **Circles are sampled into polylines, not drawn as CSS circles.** Under the
  compressed radial scale a circle not centred on the frame origin does not
  project to a circle — Mars's epicycle varies nearly 3:1 in projected radius.
  That is honest rather than broken, but it undercuts "circles upon circles",
  so the UI says so and points at the true-scale toggle, under which the
  circles come out exact.
- **The Moon's harness uses the same exaggeration its marker does**, or its
  real 0.0026 AU deferent would be drawn a hundred times smaller than the Moon
  it carries. The mapping is linear in distance from Earth, so circles about
  Earth stay circles.

Ptolemy mode defaults to the **epicyclic** engine rather than the reframe: a
mode under that name should open showing deferents and the equant, and it is
the only Ptolemaic sub-mode with machinery to display.

`core/construction.test.ts` ties the harness to the positions it claims to
explain — epicycle centre on the deferent, planet on the epicycle, equant at
twice the centre's offset, arms joining the right points — because the harness
is a second derivation of the same geometry and could otherwise drift into a
diagram of nothing.

### 13.4 Overlays are all optional, and trails must not look like harness

Everything drawn over the bodies is annotation, grouped in one panel and each
switchable on its own: **trails**, the **construction** circles, **sight-lines**
to the zodiac, and the **star figures** on the ring.

Trails and harness are both thin lines, so they are deliberately separated on two
channels at once: a trail takes its body's colour and **fades with age**, giving
it a direction of travel; the harness is uniform brass. Colour alone would not
carry it — one faint line looks much like another — and neither would the fade.

### 13.5 The celestial sphere's star figures are ornament

The ring shows principal stars joined by figure lines, in the manner of an
engraved star chart. **Star positions are approximate and decorative.** The
app's real data is the computed body positions and the division boundaries;
the figures exist to make "apparent position against the stars" legible, and
are marked as such in the source so nobody later mistakes them for a catalogue.

Pictorial engravings — an actual ram, an actual bull — would need SVG artwork
or bitmaps and are therefore out of scope under the CSS-only constraint.

### 13.6 Still assumed, not confirmed

- **Deployment form** — building for a folder of static assets with a relative
  base path. A single-file inlined bundle is a small config change if needed.
- **Czech grammar** — declined forms stored per body, so generated event
  sentences read as correct Czech.
- **Observation point** — selectable to any body, Sun and Moon included.
