# Ptolemy — 2D Solar System Model (Ptolemy / Copernicus / Kepler / Newton)

## 1. Purpose

An interactive, browser-based 2D model of the solar system (Sun, Mercury, Venus,
Earth, Moon, Mars, Jupiter, Saturn) whose **primary teaching goal** is to make the
differences and similarities between four historical/physical world-models
tangible:

- **Ptolemaic** — geocentric, deferents and epicycles
- **Copernican** — heliocentric, eccentric circles plus a small epicyclet
- **Keplerian** — heliocentric, elliptical orbits, Sun at a focus
- **Newtonian** — gravitational n-body simulation, emergent elliptical orbits

The four are ordered chronologically in the UI, and the order carries the
argument. Copernicus moved the centre and kept circles, and gained almost
nothing in accuracy for it — his construction lands in the same bracket as
Ptolemy's. Kepler kept the centre and dropped the circles, and the error fell by
a factor of ten to a hundred and fifty. Setting those two side by side is what
shows that **the ellipse, not heliocentrism, was what actually paid** — and
Newton then explains the residual Kepler could not.

The same sky, shown four ways. The user can pick an arbitrary body as the
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
| Copernicus orbits | **Eccentric circle plus epicyclet**, as *De revolutionibus* describes; a concentric-circle simplification is the second sub-mode |
| Kepler orbits | **Two-body ellipses**, no mutual perturbation — the residual is Newton's to explain |
| Stack | **TypeScript + Vite, vanilla DOM**, no UI framework |
| Zodiac division | **Both, toggleable**: 12 equal 30° signs (default) and real IAU boundaries |
| Time range | **1600–2400**, opens at today's date |
| Events | **Auto-list + on-demand search**, with **every model's predicted date shown side by side** against the reference |
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

- **`vsop87Engine`** — the reference. Truncated VSOP87 (variant B, J2000),
  sub-arcsecond across the supported range. This is the ground truth the other
  engines' error is measured against, the basis for Ptolemy's reframe sub-mode,
  and the source of the event panel's "actual" times. See §12.7.
- **`keplerianEngine`** (Kepler) — two-body ellipses from standard orbital
  elements with secular rates. Wears two hats. As a *model* it is the fourth
  selectable mode, with a construction showing the ellipse, both foci and the
  radius vector. As *infrastructure* it remains the supplier of osculating
  elements, which a positional series like VSOP87 does not give: it seeds the
  n-body integration and drives the Almagest engine's modern mean longitudes.
  It was also the reference before VSOP87 replaced it.

  Its error against the reference is the *perturbation* it omits — measured
  worst-case over 1700–2300: Mercury 0.013°, Venus 0.025°, Mars 0.062°, Jupiter
  0.221°, Saturn 0.330°. Largest for Jupiter and Saturn, the heaviest pair,
  which is exactly the signature of mutual attraction and exactly what Newton
  went on to account for. `engines/kepler.test.ts` asserts that ordering.
- **`copernicanEngine`** (Copernicus, default) — the system as
  *De revolutionibus* describes it: an **eccentric** deferent with its centre
  displaced 3/2·ae from the Sun, carrying a small **epicyclet** of 1/2·ae that
  turns at twice the mean anomaly. That bisection is not arbitrary — with those
  shares the construction reproduces an ellipse *exactly to first order in e, in
  both coordinates*, and hits both apsidal distances exactly. Worst error
  1600–2400: Mercury 0.80°, Venus 0.01°, Mars 0.33°, Jupiter 0.13°,
  Saturn 0.29°. See §12.3.
- **`circularEngine`** — every orbit a plain circle about the Sun, traversed
  uniformly. **This is not Copernicus**; it is the simplification he is often
  mistaken for, kept as a second sub-mode because it answers a real question —
  how much of an orbit's shape the eccentricity alone accounts for. Mars 13.5°
  against the eccentric's 0.33°.
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

Free choice in every mode, and the picker is one shared component. Selecting a
non-canonical origin for a mode is allowed and unremarked in the math.

Each mode declares a canonical centre (Earth for Ptolemy, the Sun for the other
two), but **it is applied only to the app's opening state and never again**.
Switching model leaves the frame origin and the observation point exactly where
the user put them, along with the date, the selection and every view toggle — so
a comparison changes one thing at a time.

An earlier version snapped the frame origin to the mode's default on every
switch, reasoning that a mode called "Ptolemy" ought to open Earth-centred. That
was a mistake: moving the centre and the engine together makes it impossible to
tell which produced the difference you are looking at, which is precisely the
question the app exists to answer. `state/store.test.ts` pins this down.

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
      vsop87.ts          # reference ephemeris; basis for Ptolemy reframe
      vsop87Data.ts      # GENERATED — see scripts/generate-vsop87.mjs
      keplerian.ts       # osculating elements; n-body seed, Almagest motions
      copernican.ts      # Copernicus: eccentric + epicyclet (his own)
      circular.ts        # concentric circles — the simplification, not him
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

- **VSOP87 (reference)** — the analytical planetary theory, variant B
  (heliocentric spherical, ecliptic and equinox of J2000, which is this app's
  own frame, so no rotation is needed). Truncated by amplitude to 2175 terms;
  see §12.7 for what that cost and why this is the reference rather than the
  Keplerian elements. The Moon is carried over from the lunar theory below,
  VSOP87 covering only the planets.
- **Keplerian** — JPL's approximate Keplerian elements valid
  3000 BC–3000 AD, including the `b/c/s/f` great-inequality terms for Jupiter
  and Saturn. The Moon uses a truncated Meeus lunar theory (27 longitude and
  distance terms, 29 latitude terms). Validated against Meeus's worked example
  47.a and against the recorded great conjunctions of 1603 and 1623, which it
  reproduces to the day. No longer the reference, but still the source of the
  osculating elements the other engines are built from: it seeds the n-body
  integration and supplies the Almagest engine's modern mean longitudes.
- **Copernican** — mean radius, mean longitude, correct orbital plane, zero
  eccentricity. The circles are not a simplification of Copernicus but a
  faithful rendering of him: *De revolutionibus* is circles-and-epicycles
  throughout, and the ellipse is Kepler's, sixty-six years later. Keeping the
  error intact is what lets the app show that heliocentrism *alone* bought no
  predictive gain — see §12.3, where Copernicus loses to Ptolemy on every
  superior planet, and §12.1's Kepler figures, where the same arrangement with
  ellipses instead of circles beats him by a factor of five hundred at Mars.
- **Keplerian** — the same JPL elements solved properly: Kepler's equation for
  the eccentric anomaly, the Sun at a focus. See the `keplerianEngine` note
  above for what its residual error is and why it is interesting.
- **Ptolemaic (epicyclic)** — Almagest apogees, eccentricities, and epicycle
  radii, shifted once into the star-fixed J2000 frame. Driven by modern mean
  longitudes rather than Ptolemy's own tables, so that what the engine shows is
  the error in his *geometry* alone.
- **Ptolemaic (Almagest tables)** — the same geometry driven by Ptolemy's own
  mean motions and his precession. See §12.6.
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

| Body | Ptolemy | Copernicus | Kepler | Newton |
|---|---|---|---|---|
| Mercury | 4.6° | 0.80° | 0.005° | 0.02° |
| Venus | 1.9° | 0.01° | 0.007° | 0.02° |
| Mars | 2.8° | 0.33° | 0.03° | 0.04° |
| Jupiter | 0.6° | 0.13° | 0.15° | 0.19° |
| Saturn | 2.6° | 0.29° | 0.35° | 0.58° |

Two things follow. First, Newton mode's own error stays below the historical
models', so cross-model comparisons measure the models rather than the
integrator. Second — and this is the app's most valuable single result —
**heliocentrism on its own bought almost nothing**: Copernicus and Ptolemy sit
in the same bracket, built from the same number of circles to within one, and
cost the same to work by hand. Only Kepler's change of *shape* broke the
deadlock. `engines/accuracy.test.ts` asserts this so it cannot silently
regress, and the note below records how the app got it wrong for a long time.

#### The Copernican correction

This app asserted, prominently and in its test suite, that **Ptolemy predicted
the superior planets better than Copernicus**. The measurement was real; the
claim was not. `circularEngine` put every planet on a *concentric* circle moving
uniformly, and the 13.5° error that followed at Mars was being read as the cost
of using circles instead of ellipses.

Copernicus did use circles rather than ellipses, which is true and matters. He
did **not** use concentric circles: the bulk of *De revolutionibus* is the
machinery that avoids exactly that — an eccentric deferent plus a small epicyclet
replacing Ptolemy's equant, with the eccentricity split 3/2 and 1/2 between them.
With that in place Mars falls from 13.5° to 0.33°.

The corrected claim is the one historians actually make, and it is sharper than
the old one: **heliocentrism on its own bought almost nothing**. Copernicus and
Ptolemy sit in the same bracket, use the same number of circles to within one,
and cost the same two table look-ups. What broke the deadlock was Kepler's
change of *shape*.

Two honesty notes that the tests carry as comments:

- The comparison is **asymmetric**. The Ptolemaic engine runs on Almagest
  parameters, carrying Ptolemy's measurement errors; the Copernican runs on
  modern ones, showing his construction at its best. His own figures were no
  better than Ptolemy's, so the real *Prutenic Tables* were not the improvement
  the table suggests. "Same order", never "Copernicus won".
- On **Jupiter and Saturn the Copernican construction beats this app's Kepler
  engine** (0.13° against 0.15°, 0.29° against 0.35°). That is not a defeat for
  the ellipse but a fact about a *two-body* ellipse: it omits the mutual
  attraction of the heaviest pair in the system, and that omission is larger
  there than the second-order error the circles leave behind. The ellipse's real
  advantage on those planets appears only once perturbation is added, which is
  Newton's territory.

### 12.3b The moons, and why they sit outside every model

The four Galileans and Titan are drawn **identically under all four models**,
and that is not laziness. No pre-1610 model contains them: Ptolemy had never
heard of them and Copernicus died sixty-seven years before anyone saw one. What
changes when the model changes is where *Jupiter* is; the moons ride along.

Which is the point Galileo made. Four bodies plainly going round something that
is not the Earth was the first observation the geocentric system had no answer
to, and selecting Jupiter in Ptolemy mode puts that contradiction on screen.

**Precision is not claimed.** The mean longitudes are approximate, so the
configuration on a given date is not to be trusted. The *periods* are accurate,
because the two demonstrations rest only on them and both are asserted in
`satellites.test.ts`:

- **Kepler's third law holds inside the Jovian system.** `a³/P²` comes to
  2.397, 2.396, 2.396, 2.396 ×10¹⁶ km³/day² across the four Galileans —
  constant to four figures, with a constant of its own about a thousandth of the
  Sun's, because the constant is set by the mass at the centre.
- **The Laplace resonance**, 1:2:4, and not merely as a ratio: the test checks
  the relation between the mean motions, `n_Io − 3·n_Europa + 2·n_Ganymede ≈ 0`,
  which a coincidence of ratios would not satisfy.

#### How they are drawn

Four rules, all about keeping a system of four legible rather than about
accuracy:

- **Orbits like any other body.** A moon's trail is logged and projected exactly
  as a planet's is. Its *marker*, its *trail* and its *orbit circle* are computed
  in three different places, so all three go through the same exaggeration —
  `satelliteView.test.ts` asserts that every sampled point of the drawn circle
  sits at the marker's own radius, and that the trail keeps to it too. Get one of
  them wrong and the moon sits off its own orbit.
- **The harness is the whole family.** Selecting Jupiter draws all four Galilean
  orbits; selecting Io draws its siblings as well. A single circle says nothing
  about a system whose entire interest is the relation between its members — the
  1:2:4 spacing is only visible with all of them present.
- **Sight-lines only for a selected moon.** Five more rays converging on the
  observer, from bodies sitting a pixel or two from their planet, would put five
  near-identical lines and five pips on one spot of the ring, exactly where the
  planet's own reading belongs.
- **Names only when the family is selected *and* the map is magnified**
  (`SATELLITE_LABEL_ZOOM = 3`), and an off-screen moon earns an edge pointer
  (§13.3c) on the same family test — zoom deep enough to throw Jupiter off the
  map and it takes its moons with it, all on one bearing, so five stacked
  chevrons would only repeat what Jupiter's already says. When the Jovian system
  *is* the selection they are the point of the exercise.
  At the fitted view the four Galileans share a few
  pixels, so the labels would overlap each other and Jupiter's.

The orbit circles come from `satelliteConstruction()` in `selectors.ts` rather
than from an engine, because **no engine supplies one** — the moons are not
derived by any model here, and Newton's engine exposes no `construction` at all.
Without that they would be bare dots in that one mode.

One consequence of "orbits are logged, never pre-computed" is worth knowing: at
high time rates a frame-rate log cannot resolve Io's 1.77-day orbit, and the
trail degenerates into a polygon. That is honest rather than broken — at 20
days/s you genuinely are not sampling Io — and it comes right at ordinary rates.

#### They are not in the integrator

`GRAVITATING_BODY_IDS` is deliberately **not** `BODY_IDS`. The n-body run steps
a quarter of a day, which gives Io — going round in 1.77 days — **seven steps
per orbit**, and an orbit sampled seven times does not close. Resolving it would
need a step fifteen times finer and, with fourteen bodies instead of nine,
would turn a 370 ms seek to 1602 into something near fifteen seconds.

So they are two-body riders on their integrated primary. That is not a dodge
around the arithmetic but **Newton's own treatment**: *Principia* Book III takes
Jupiter's moons as a two-body problem, and that is how he weighed Jupiter.

#### Drawing them at all

Projected honestly they are hopeless — at compressed scale Io sits 0.0125% of
the map radius from Jupiter, which on a 600px map is four hundredths of a pixel,
and Callisto manages a sixth of one. They get the same exaggeration the Moon
does, **linear in the true distance**, which is what keeps the system legible as
a system: the Galileans span 4.5:1 from Io to Callisto and a linear scaling
preserves both their order and their spacing. Measured on screen at moderate
zoom: 45, 66, 119 and 197 px from Jupiter, a 4.4:1 spread.

**On the compressed scale only**, on the same reasoning as §13.3b. When the
moons were first drawn the exaggeration was unconditional, which left the
honest view carrying a satellite system inflated four hundred times — precisely
the lie the true-scale toggle exists to switch off. `satelliteDrawnRadius()`
now takes the scale mode and hands true scale straight to `projectRadius`. Drawn
honestly Io sits 0.000161 of the map radius from Jupiter; the deep zoom of
§13.3c is what makes the family separable again, and at 1000x it measures 27 px
for Io and 121 px for Callisto. That pairing — an honest projection plus enough
magnification to read it — is the whole reason the zoom ceiling was raised.

They are also excluded from event scanning. Io and Europa conjoin every couple
of days, and including them would bury every genuine planetary event under a
drift of moon-on-moon conjunctions nobody in any century thought worth
tabulating.

### 12.4 Deliberate simplifications

- **Ptolemy's lunar crank is not implemented.** The engine uses the simple
  Hipparchan epicycle, which reproduces the 5° equation of centre at syzygy but
  not the evection. Ptolemy's correction for it famously made the Moon's
  distance vary nearly 2:1, predicting an apparent size change that plainly does
  not happen — a good teaching point, and a candidate for later work.
- **The nested spheres *are* modelled.** This was previously listed here as a
  limitation, and it has been fixed — see §12.5.
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

### 12.5 The nested spheres, and why they matter

The Almagest fixes only the *ratio* r/R for each planet. The absolute size of a
deferent is free, because scaling a planet's deferent, eccentricity and epicycle
together leaves its direction from Earth exactly unchanged. Ptolemy settled the
scale separately, in the *Planetary Hypotheses*, with a cosmological argument:
the heavens contain no gaps, so each planet's shell begins where the one below
it ends — Moon, Mercury, Venus, Sun, Mars, Jupiter, Saturn.

`nestedDeferentRadii()` reproduces that chain, and it is what turns the engine
from a calculating device into a physical claim. Two consequences, neither of
which the angular construction alone produces:

- **Mercury and Venus lie always between Earth and the Sun.** Measured over
  3000 days: never once beyond it, Venus ranging 0.144–0.958 AU against the
  Sun's 0.958–1.042. Venus's maximum sits precisely on the Sun's inner surface.
- **The superior planets lie always beyond the Sun.** Mars 1.13–7.51 AU, never
  nearer than the Sun on any day sampled.

A subtlety worth keeping: the shell thickness must count the **eccentricity as
well as the epicycle**. The deferent's centre sits a distance *e* from Earth, so
the epicycle's centre already ranges over R ± e. A first version ignored that
and left Mars nearer than the Sun on 82 days out of 3000 — precisely what the
nesting exists to forbid.

The chain is anchored on the **Sun**, not the Moon. Ptolemy's own chain started
from his roughly correct lunar distance and arrived at a Sun some 1210 Earth
radii away, about a nineteenth of the truth. Anchoring on the Sun keeps this
model dimensionally comparable with the other two, which is the point of the
app, and costs only the Moon's shell — whose drawn distance is exaggerated
anyway.

**This reverses an earlier finding.** The app used to anchor each deferent so the
epicycle equalled the planet's true heliocentric orbit, which gets longitudes
right but let Venus pass behind the Sun and show a full disc. That was documented
here as a limitation and as the reason the app could not reproduce Galileo's
observation. It can now: with Venus penned inside the Sun's shell it never
exceeds 44% lit, so the model says crescent where the sky says full.

The cost is that the epicycle is no longer visibly the heliocentric orbit — the
correspondence that makes Copernicus's rearrangement obvious. That reading is a
modern one, and the `ptolemaic-reframe` sub-mode already carries it.

### 12.6 Ptolemy's own tables

A third Ptolemaic sub-mode, differing from the epicyclic one in exactly one
respect: where the mean longitudes come from. Holding the geometry fixed and
swapping the tables separates the error in his *construction* from the drift in
his *rates* — which is the only reason to have both.

The rates are transcribed from the Almagest's sexagesimals. Their internal
consistency is a good check: the solar figure reproduces the tropical year he
states, 365;14,48 days, and the synodic periods come out right to about two parts
in a hundred thousand — Babylonian records with baselines centuries long doing
their work.

**Measured drift from his epoch to the present, in apparent longitude:**

| Mercury | Venus | Mars | Jupiter | Saturn | Sun |
|---|---|---|---|---|---|
| 12.5° | 22.2° | 0.6° | ~1° | 1.0° | 0.9° |

This is not the result I expected, and the split is the interesting part. It does
not track how good each rate is — they are uniformly excellent — but **how many
times the body has gone round**. A fractional error in a period is paid once per
revolution, and since 137 AD Venus has completed some 3,000 circuits and Mercury
7,800, against Saturn's 64. Hence tens of degrees for the fast inner planets and
about a lunar diameter for the slow outer ones.

The Sun does well for a second reason. His *tropical* year is six and a half
minutes too long — the error that walked the Julian calendar out of step with the
seasons — but this app draws in a star-fixed frame, and there that error is
largely cancelled by his precession being a quarter too slow. Two mistakes that
partly undo each other.

**Two modelling choices worth knowing:**

- **Anchored at his epoch, not at Nabonassar.** The engine assumes his tables
  were right in his own lifetime — roughly true, since he calibrated against
  contemporary observations — and shows only what his *rates* do when carried
  forward. Divergence therefore grows from nothing at 137 AD to its full size
  today, which is what makes the comparison attributable.
- **Apogees are converted identically in both sub-modes**, using the true
  precession. Carrying the apsidal lines with his own slow value is tempting and
  wrong: an apogee is fixed against the *stars*, and Ptolemy measured his
  correctly in his own era. Using his rate there would misplace every apsidal
  line by seven degrees at *all* dates including his own, so the two engines
  would disagree at the very epoch the tables are anchored to. His precession
  does still enter, in the one place it belongs — converting his tropical mean
  motions into this star-fixed frame.

`engines/almagest.test.ts` pins the figures down, including that divergence is
below 0.05° near 137 AD and that the nested spheres are undisturbed.

### 12.7 The reference ephemeris, and what its times are worth

The event comparison shows four rows: the modern reference first, then each
model with its miss beneath it. `REFERENCE_ENGINE` names the engine treated as
ground truth — `vsop87`.

The solver bisects to under a second, so **the precision on show is entirely the
ephemeris's**. That precision is not uniform, and the reason governs this whole
section: an event is found where an angle crosses zero, so a fixed angular error
becomes a time error *divided by the rate at which the angle closes*. Mars comes
to opposition briskly. Jupiter and Saturn converge at a few hundredths of a
degree a day, which multiplies any angular error by roughly thirty.

That amplification is what forced the change. Measured against published times:

| event | approximate elements | VSOP87 |
|---|---|---|
| Mars opposition, Oct 2020 | 1.5 hours | **7 minutes** |
| Great conjunction, Dec 2020 | 11 hours | **8 minutes** |

An **hour is now sound for both**, so the panel's printed time means what it
appears to mean. `core/referenceAccuracy.test.ts` holds these figures, and keeps
the old engine's error as a test too — it records why the change was worth
making. The n-body engine remains far worse on the slow event, which is why the
table lists it among the models being judged rather than as the thing judging.

#### Variant B, not D

Meeus works in VSOP87**D**, referred to the ecliptic and equinox *of date*. This
app uses **B**, referred to J2000 — because J2000 is already the app's frame
everywhere else, so B needs no rotation and D would need one applied and then
undone. The consequence shows up in testing: the radius from Meeus's example 32.a
matches to his last published digit, but his latitude differs by about two
arcseconds. That gap is the frame, not an error — the ecliptic pole itself drifts
some 47″ a century and the example sits eight years before the epoch.

#### The truncation, and how the table is generated

The full series is tens of thousands of terms. `scripts/generate-vsop87.mjs`
emits `core/engines/vsop87Data.ts` by dropping every term below an amplitude
threshold. The generator reads its coefficients from `astronomia`, a
devDependency held **purely as a verified data source** — it is not imported by
anything shipped, and the alternative was hand-transcribing thousands of
coefficients, where a single typo would be invisible and wrong.

`scripts/sweep-vsop87.mjs` measured the trade against the full series:

| threshold | terms | worst angle | worst radius |
|---|---|---|---|
| 1e-6 | 1297 | 2.11″ | 2740 km |
| **3e-7** | **2175** | **0.79″** | **989 km** |
| 1e-7 | 3438 | 0.42″ | 379 km |
| 1e-8 | 8973 | 0.06″ | 33 km |

3e-7 is the chosen point: sub-arcsecond, which is far inside what any of the
three historical models can resolve, at 80 kB of source. The bundle went from
73 kB to 150 kB raw, 57 kB gzipped — the one real cost, and acceptable for a
static teaching app.

`vsop87.test.ts` re-derives the truncation error against the *full* `astronomia`
tables rather than trusting the sweep, so a future regeneration that silently
changed the threshold would fail the suite.

#### Remaining limits

The Moon is not covered by VSOP87 and is carried over from the truncated Meeus
lunar theory in `keplerian.ts`; ELP2000-82B would be the upgrade. For validating
rather than computing, JPL Horizons is the right source — pull exact times
offline and assert against them, as `referenceAccuracy.test.ts` does for two.

## 13. UI Layer Notes

### 13.0 The shell and the themes

**Layout.** The map is full-bleed and the controls float over it in docks:
model/vantage/overlay controls on the left, a slim language-and-theme bar hugging
the top-right corner, the selected-body detail directly beneath it, and time with
the simulation transport at bottom right — with an unboxed credit line tucked
beneath that last panel, built once rather than on every controls rebuild,
since nothing in it ever changes.

The instrument is *not* measured against the viewport but against
`.stage__field`, an element inset by the dock widths. That is what keeps the map
centred in the gap the user can actually see and the zodiac labels clear of the
panels, even though the drawing itself may pass beneath them. Below 60rem the
docks stop floating and stack as a scrolling column under the map.

**Themes.** Four looks, chosen from the top bar and remembered in localStorage:

| id | |
|---|---|
| `orrery` | brass on parchment, c. 1750 — the original, unchanged |
| `atelier` | the same pigments as a modern instrument: near-white ground, UI sans, soft elevation, generous radii |
| `nocturne` | the same instrument by candlelight — warm lamplight on metal against sky-black |
| `lcars` | after the Okudagram: black ground, flat saturated blocks, asymmetric elbows |

A theme is **a block of custom properties and nothing else**. No theme file
contains a component selector, with one deliberate exception: LCARS needs shape
overrides (block capitals, elbow radii, borderless controls), kept to a short
block confined to the `theme` cascade layer so it cannot outrank structure.

Two naming layers exist on purpose. Themes define *semantic* tokens (`--surface`,
`--text-strong`, `--accent`); the instrument CSS still reads the
parchment/ink/brass names it was written with, and `tokens.css` aliases one to
the other. Renaming nine hundred lines of geometry to suit a dark palette would
have been a large, risky edit for no functional gain.

Colours that had been baked into `layout.css` — the terminator fill, the velocity
vector's blue, the net-force ink — are now tokens, or the dark and LCARS themes
would have had invisible phases and an unreadable velocity arrow.

Files: `tokens.css` (contract and fallbacks), `theme-*.css` (one per look),
`shell.css` (docks, panels, controls), `layout.css` (the instrument).
`@layer tokens, structure, components, theme` fixes the precedence.

**Contrast** was measured rather than eyeballed, on the body surface: body text
10.0–15.2:1 across all four themes, engraved ring hairlines 4.2–6.2:1, ring
labels 6.3–14.1:1. Atelier's muted text was darkened from the inherited value,
which only reached 3.4:1 against a near-white ground; Orrery keeps the original,
since preserving that look is the point of having both.

**Zoom** is the mouse wheel, and needs no centre of its own. Every element on the
instrument is positioned in units of `--unit`, and the frame origin sits at the
instrument's middle, so folding a multiplier into that unit magnifies *about the
stationary point* by construction — no translation, no reprojection, no trail
recomputed. Verified: with Mars as the stationary point, Mars stays pinned at zero
offset while everything else moves out by exactly the zoom factor.

The multiplier is written only when it changes, since it invalidates every
descendant's transform; a wheel event on every frame still holds 60fps. The wheel
is bound to `#app` rather than the instrument, whose box is smaller than the area
its drawing covers once magnified, and events from inside a dock are left alone so
the panels can still scroll. Double-click resets, because the wheel offers no
obvious way back.

The zoom hint in the controls is deliberately **static**: putting the live
magnification there would tie the panels to a value that changes on every wheel
tick, and rebuilding them through a gesture is the trap the clock readout fell
into.

**Panning** is a pointer drag anywhere on the map. The offset is stored in
**map-radius units, not pixels**, and applied as a single transform on
`.instrument` rather than folded into every element: one property write, no
layout change, so the ResizeObserver that sizes the field is untouched and each
marker's hit box travels with its drawing.

Units rather than pixels because of how it composes with zoom. A body renders at
`centre + (p + pan) . unit`, so the world point that stays put under a
magnification is `-pan`, whatever the zoom — that is, whatever sits in the middle
of the screen stays in the middle of the screen. At pan zero that point is the
frame origin, which is exactly the zoom-about-the-stationary-point behaviour the
wheel was built around, so the older rule survives as the special case.

Two details that are easy to get wrong:

- A drag only begins after **3px** of travel. Without a threshold, every click on
  a planet would pan the map by the two or three pixels a hand moves while
  pressing a button. A click that follows a real drag is then swallowed in the
  capture phase, so a drag ending over Mars does not also select it.
- `setPointerCapture` is wrapped in a `try`. It throws `NotFoundError` when the
  pointer is no longer active, and an uncaught throw inside `pointermove` aborts
  the rest of the handler and drops that frame's pan. Without capture the drag
  still works, it merely ends if the pointer leaves the element.

**Choosing a new stationary point resets the pan**, so the map actually centres
on it. Keeping the drag would be the literal reading of "hold that body still"
and the wrong one: someone who asks to look at Mars and finds it off the edge of
the screen, because of where they had dragged five minutes earlier, has not been
given what they asked for. Changing the *observation* point leaves the pan alone
— that is a different question from where the map is looking. Double-click still
clears both zoom and pan, since neither offers an obvious way back on its own.

**The rate ladder** (`RATE_LADDER`) is stepped by − and + buttons beside
play/pause. It is geometric — 0.25, 1, 5, 20, 100, 400 days a second — because the
useful range spans a factor of 1600 and a linear control would be unusable. The
buttons clamp at both ends rather than wrapping.

### 13.0a Getting out of the way

Four panels of controls, each carrying a paragraph of standing italic prose, is a
long scroll between a user and the control they wanted. Four changes, roughly in
order of how much they helped:

**Explanations collapse.** All `.note` and `.field__hint` text hides behind a ⓘ
in the top bar, driven by `:root[data-notes='off']` so nothing rebuilds when it
is toggled. **Off by default** — the prose is good but it is reference material,
and anyone past their first few minutes wants density. The exception is
`.note--live`: the trail readout is a *status* line, not an explanation, and
hiding it would remove information rather than prose.

**A welcome, once per browser.** Previously a newcomer met every affordance and
no entry point. Three sentences on what the app is, three on what to do, the two
keys a presenter needs, and a primary button that opens the demonstrations rather
than merely dismissing. Stored in localStorage, deliberately *not* in the URL —
a shared link should not re-run a welcome its recipient has already seen.

**Body chips** name and colour every body, and select it when clicked. A legend
that is also a control, so the panel earns its space; it also gives the keyboard
a route to a body, which previously existed only by tabbing the map markers.

**Compare-all.** The ghost overlay drew one rival model, which was reasonable
with three models and thin with four. `ghostEngineId` now accepts `'all'`, and
`buildView` returns an array of `GhostLayer` rather than a single map. Ghosts are
pooled per body and grown on demand, so a session that never opens the overlay
allocates nothing extra.

With three ghosts on the map they are tinted **by model** rather than by body
(`--model-ptolemy` and friends). Which planet a ghost belongs to is already
answered by the link line running back to it; which model put it there is not,
and with three on screen that is the only question worth asking. A key appears
under the picker whenever compare-all is on. The reference engine is deliberately
excluded — it is not one of the models being compared, and including it would
turn a comparison into a marking scheme, which is the events panel's job.

**Keyboard**: space plays and pauses, arrows step a day, Escape closes the
topmost overlay. Ignored while an input or select has focus, or space would
toggle whatever button was last clicked and the arrows would walk a select
through its options. This is a lecture tool; hunting for a small button on a
projected screen is its own small disaster.

### 13.0b Shareable configuration

Six fields live in the URL, so a link in a slide deck reopens the same
arrangement:

```
#model=ptolemy&type=ptolemaic-almagest&centre=earth&observer=mars&sphere=observer&date=1610-01-07
```

Model, engine, stationary point, observation point, sphere centring, date. Kept
in the **hash**, not the query string: the app is static files on a host with no
backend, so a query the server has never heard of risks a 404 on reload, and a
hash change never reaches the network. Keys are spelled out because a readable
URL is itself a small piece of documentation.

**Every field is optional in both directions.** A link may carry any subset —
hand-written, truncated by a mail client, or produced by an older version with
fewer fields — and each is applied on its own, leaving anything absent as the
reader found it. `#observer=jupiter&date=1610-01-07` is a perfectly good link.

The date is written as a **calendar date** rather than a Julian Day: exactness is
worth trading for a URL that says what it means, and day resolution matches both
what gets shared (a conjunction, an opposition) and the date field in the
controls. Dates outside 1600–2400 are rejected, since beyond that the elements
are extrapolation and no date beats a bad one.

**Still not included**: the zoom, the theme and the language. Zoom is a way of
looking rather than a thing to look at; the other two belong to whoever opens the
link, and one that silently repainted someone's interface would be rude.

Four things the implementation has to get right:

- **Validation is per field.** A hand-edited or truncated link must degrade to a
  working app, so a bad value is dropped and the rest kept. The engine is also
  checked against its *mode*: `model=newton&type=circular` names two real things
  that cannot be combined, and keeping it would leave the mode buttons
  disagreeing with the map.
- **`store.hydrate()` applies a link as one patch**, not a run of setters —
  `setMode` would reset the engine that the next call was about to set, and
  subscribers would briefly see a state nobody asked for.
- **`replaceState`, and a write guard.** These controls get swept through while
  comparing models, so one history entry per click would bury the page the
  reader came from. And since writing the hash fires `hashchange`, the last
  written value is remembered — otherwise the app would read its own write back
  and re-hydrate on every click.
- **The date is throttled, but only while playing.** It advances every frame
  during playback and browsers rate-limit `replaceState` — Safari throttles it
  and logs a warning. Measured: 60 day-steps in 300ms produced one write rather
  than sixty. But the throttle must *not* apply when paused, or the URL is left
  showing whatever date the last throttled write happened to catch. A deliberate
  jump — a step, Today, picking a date, pausing — is exactly when someone might
  reach for the address bar, so those land at once.

### 13.0c The calculation overlay, and the demonstrations

The rest of the app shows the four models as *pictures*. None of them was a
picture. Each was a procedure for turning a date into a number, and the numbers
were the product — the *Almagest* is a book of tables, the Alfonsine Tables ran
European astronomy for three centuries, and Kepler spent the better part of
thirty years on the *Rudolphine Tables*. `core/calculation.ts` reproduces each
model's working for one body on one date, in the order an astronomer would have
carried it out.

What it shows is that accuracy was not bought at a steadily rising price:

| model | what it cost |
|---|---|
| Ptolemy | two table look-ups and two additions |
| Copernicus | one look-up, no correction at all |
| Kepler | a transcendental equation, solved by iteration, per body per date |
| Newton | nothing new — his two-body solution *is* Kepler's ellipse |

The labour climbs steeply from Ptolemy to Kepler and then **stops**, which is
worth reading beside the accuracy table in §12.1.

**Newton is the column easiest to get wrong, and a first version got it wrong.**
It showed step-by-step integration and a count of force evaluations, which is
twentieth-century numerical celestial mechanics and not what Newton did. The
*Principia* solves the two-body problem in closed form — Book I proves an
inverse-square force toward a focus yields a conic — so for one planet Newton
needed no new arithmetic at all, and the panel now says so by printing a
two-body longitude identical to Kepler's.

What Newton actually added, and what the column shows instead:

- The ellipse stopped being a curve fitted to Tycho's observations and became a
  consequence of a force. Same curve, different standing entirely.
- Kepler's third law gained its missing constant. `P² = 4π²a³ / G(M + m)` lets a
  period be *computed from the masses* rather than measured, and run backwards it
  weighs the Sun. The panel derives it and lands within a fraction of a day —
  Mercury 87.97 d, Mars 686.99 d, Saturn 29.47 yr.

Beyond two bodies there is no closed form, which Newton knew — the lunar theory
is where he said the problem made his head ache, and he attacked it by
perturbation. The app's integration is still shown, as a clearly separate line
labelled as this app's doing rather than his.

The panel is an *overlay* rather than a dock because four columns of working are
wider than any dock, and it is rebuilt only while open, on a wall-clock budget —
it evaluates four engines.

Values leave `calculation.ts` as **raw numbers plus a unit tag**, and the view
formats them. Czech writes 141,500 where English writes 141.500, and this is the
one panel in the app that is nothing but numbers. A first version formatted in
core and hard-coded a decimal point into every line.

Each column carries **two** notes, answering different questions. `costKey`
prices *one position*. `tablesKey` prices *the book of them*, which is the larger
half: nobody computed a planet from scratch when they wanted one, they opened a
table, and making that table is where each model's characteristic difficulty
actually lived.

| model | the tables | what made them hard |
|---|---|---|
| Ptolemy | *Almagest* c. AD 150; *Handy Tables*; later the Alfonsine Tables | Mean motions leaned on Babylonian eclipse records centuries older, for the baseline. The equation of argument varies with the epicycle's distance, so it needs two tables and an interpolation between them. |
| Copernicus | Reinhold's *Prutenic Tables*, 1551 | Years of recomputation for barely any gain — the circles set the floor. Rejecting the equant on principle bought extra small circles, so nothing got simpler to tabulate. |
| Kepler | *Rudolphine Tables*, 1627 | Twenty-six years, through a war, a lawsuit over Tycho's observations and his mother's witchcraft trial. Every entry needed Kepler's equation solved by iteration, which is why he seized on Napier's logarithms partway through and bound a log table into the result. |
| Newton | none | The *Principia* contains no ephemeris. Closing the gap to a usable table took another century of perturbation work — Clairaut's lunar apsidal motion came out at half the observed rate before he carried the approximation further. |

The Kepler note claims the older constructions place the 1631 Mercury transit on
4 November. That is asserted in `demonstrations.test.ts` rather than merely
written: measured, Copernicus is 2.5 days early and Ptolemy 2.7. Both still
*predict* a transit, which is the more interesting version — the geometry was not
so wrong that Mercury missed the disc, it was wrong about the day, and an
observer following it would have watched on the wrong one.

**Demonstrations** (`core/demonstrations.ts`) are the handful of moments when the
models disagreed about something the sky could settle: Venus gibbous in 1610,
the Mercury transit of 1631, the great conjunctions of 1603 and 2020, the Mars
opposition of 1602. Each sets date, model, centre, vantage and selection at
once — deliberately unlike `setMode`, which changes one thing at a time, because
a demonstration is a whole scene rather than a controlled comparison.

**Every date was found with the app's own solver, and `demonstrations.test.ts`
re-derives them.** A teaching tool that cites a wrong date is worse than one
that cites none. The 1631 transit is checked twice over: that Mercury is in
conjunction with the Sun, *and* that its geocentric latitude is inside the solar
disc — and that the neighbouring conjunctions that year are not transits, so the
date is doing real work.

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

Three engines have one, and read as a sequence they are the argument in
miniature. The Ptolemaic epicyclic engine gives the full harness. The Copernican
engine gives a circle and a radius arm, and that spareness is itself the lesson —
set beside deferent-plus-eccentric-plus-equant-plus-epicycle, it is what made
Copernicus feel like an enormous simplification even though he predicted no
better. Kepler gives one curve, two foci and a radius vector, which is fewer
parts still and the only one of the three that is actually right. The n-body
integrator has no construction, and the Earth-centred reframe borrows accurate
positions rather than deriving them, so both leave the method undefined and the
toggle hides.

#### Kepler's harness shows what is absent

The construction marks **both foci** — the Sun on one, nothing whatever on the
other — and the geometric centre as a third, separate point that now governs
nothing. That absence is the entire content of the first law and is invisible
unless the empty focus is drawn, so it is drawn. Set against the Ptolemaic panel,
where the equant is marked most strongly of anything in the app, the pair makes
the point that a century of eccentrics and equants was an elaborate way of
approximating a focus.

The radius vector is drawn brightest because its *sweep* is the second law, which
no static figure can show: run the clock and watch it move quickly at perihelion
and slowly at aphelion.

**Ellipses are a distinct primitive** (`ConstructionEllipse`), given as a centre
plus two semi-axis *vectors* rather than lengths and an angle. An angle would
need a plane to be measured in, forcing every consumer to agree on a convention;
two vectors carry orientation, orbital tilt and both lengths at once, and
sampling reduces to `centre + major·cos θ + minor·sin θ`. Circles and ellipses
are then sampled into the same array of projected polylines — after the
nonlinear compressed-scale projection neither survives as the shape it started
as, so nothing downstream needs to tell them apart.

#### The Moon's ellipse is osculating, and that is the interesting part

Every other body in this mode is placed *by* an ellipse: the engine solves
Kepler's equation and the drawn curve **is** the calculation. The Moon is not. It
comes from the truncated Meeus lunar theory — a sum of periodic terms — because
no fixed ellipse describes it well enough to be worth having. A circle at the
mean distance is out by up to **27 700 km**.

So `moonOsculatingConstruction()` derives the ellipse from the answer instead of
producing it: the unique two-body orbit tangent to the Moon's motion at that
instant, reconstructed from position and velocity via the eccentricity vector
and vis-viva. It passes through the Moon by construction, so the radius vector
and the marker cannot disagree.

The reason to draw it is that **it will not hold still**. Measured over
2026–2030:

| osculating element | range |
|---|---|
| semi-major axis | 379 508 – 387 712 km (2.2%) |
| eccentricity | **0.0263 – 0.0767**, very nearly ×3 |

A planet's osculating ellipse is fixed to a millionth over the same span;
`kepler.test.ts` asserts the ratio. That wandering is the Sun pulling on the
Earth–Moon pair — the thing Ptolemy bolted a crank onto his lunar model to chase
(§12.4) and that Newton was the first to explain. Showing a tidy fixed curve
there would hide the single best demonstration in the app of where Kepler's laws
stop. The harness therefore gets its own legend for the Moon, since "the Sun
sits at a focus" and "this is what the motion implies right now" are different
claims.

One projection detail makes this work: `moonDrawnRadius()` is *linear* in true
distance, so the Moon's exaggerated orbit scales the ellipse by a constant
(~11.7×) and preserves its shape. Only the cap that keeps the Moon inside
Mercury distorts it, and only in the crowded views where it is already
distorting the Moon's own marker.

#### Newton's machinery is vectors, not circles

Newton places a body by *force*, so his counterpart to the deferent and epicycle
is not a curve but a pair of vectors. The n-body engine therefore exposes
`dynamics()` alongside the others' `construction()`, and both render in the same
harness layer under the same switch — labelled **Konstrukce / Construction** for
the geometric models and **Síly / Forces** for Newton.

For the selected body it draws the **velocity**, the **net force**, and **one
gravitational pull per other body**, each in the colour of the body exerting it.
Only the n-body engine can do this, because only an integrator carries
velocities: a historical construction yields a position for a date and nothing
more.

**Lengths are ordered but not proportional.** The Sun is 99.5% of the pull on
Earth, so true proportions would render every other vector a sub-pixel nub and
the display would say only "the Sun wins" — which the numbers say better. A
fourth root turns a 20,000:1 spread into about 12:1, with a floor so the weakest
stay findable. Exact magnitudes in newtons, plus each pull's share, are listed in
the info panel, and the UI states that the drawing is compressed.

Three things worth pointing students at, all visible in the panel:

- **Earth**: Sun 3.44·10²² N (99.5%), Moon 1.84·10²⁰ N (0.53%), everything else
  under 0.002%. This is why treating an orbit as a two-body ellipse works.
- **The Moon**: Sun 4.21·10²⁰ N (69.5%) against Earth's 1.84·10²⁰ N (30.5%) —
  the Sun pulls the Moon more than twice as hard as Earth does, yet the Moon
  still orbits Earth, because the two are falling toward the Sun together.
- **Newton's third law**, readable across two selections: Earth←Moon and
  Moon←Earth are both 1.84·10²⁰ N.

Velocity is drawn to a separate scale, normalised so Earth's mean orbital speed
is a fixed length; the arrow then reads directly as "faster or slower than
Earth", and its length falling off with distance from the Sun is Kepler's third
law emerging from an integration that was never told it.

Vector directions are found by *local linearisation* — projecting a short step
along the vector and differencing — not by projecting the direction itself, which
would be wrong wherever the radial scale is compressed.

#### Drawing the geometric circles

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

  That exaggeration is bounded by Ptolemy. His nested spheres brought Mercury in
  to 0.058–0.143 AU, and the original figure of 0.055 map units then drew the
  **Moon outside Mercury on a fifth of all days** — inverting the one ordering
  the system is most remembered for. It is now 0.03, and capped at 45% of
  Mercury's drawn separation as a backstop for views where even that is too
  much: a Ptolemaic map recentred on the Sun draws Earth and Mercury almost on
  top of each other, and there the Moon shrinks to a few pixels rather than
  overtake the innermost planet. An invisible Moon is a smaller lie than one
  above Mercury.

  All three places that draw the Moon — marker, trail and harness — share one
  function, or its orbit would part company with its own trail.
  `state/moonOrdering.test.ts` checks the ordering across every model, both
  frames, both scales, and a few non-canonical centres.

Ptolemy mode defaults to the **epicyclic** engine rather than the reframe: a
mode under that name should open showing deferents and the equant, and it is
the only Ptolemaic sub-mode with machinery to display.

`core/construction.test.ts` ties the harness to the positions it claims to
explain — epicycle centre on the deferent, planet on the epicycle, equant at
twice the centre's offset, arms joining the right points — because the harness
is a second derivation of the same geometry and could otherwise drift into a
diagram of nothing.

### 13.3b The Moon is only exaggerated at compressed scale

`moonDrawnRadius()` takes the scale mode, and at **true scale it returns the
honest projected distance**. It did not always: the exaggeration was applied
unconditionally, so the "realistic" view drew the Moon roughly **two hundred
times** further from Earth than it is — 0.03 of the map radius against a real
0.000147.

That defeated the point of the toggle. True scale exists to be honest, and an
honest view carrying the app's most conspicuous lie is worth nothing. Measured
after the fix, at a 300px map radius: **0.033 px** from Earth in every model,
which is 384 000 km against a 17.5 AU system and is exactly where it belongs.

The compressed scale still exaggerates, by about 204× — without it the Moon is
invisible at any magnification that also shows Saturn. Under Ptolemy the factor
falls to 35× because the Mercury cap engages: his nested spheres bring Mercury in
to 0.058 AU, and the backstop stops the Moon overtaking it. `scaleGeometry.test.ts`
holds both halves for all six engines, and checks the Moon never passes Mercury
across two years of dates.

### 13.3c The zoom ceiling depends on the scale, and off-screen bodies get pointers

Two changes that only make sense together.

**The ceiling was too low to show what true scale draws.** Once the Moon stopped
being exaggerated at true scale (13.3b) it sat 0.000147 of the map radius from
Earth — honest, and at the old ceiling of twenty times, *invisible*. On a 650px
field that is **0.65 px**: the Moon is welded to the Earth and the toggle shows
nothing it promised. `maxZoomFor()` therefore returns **1000 at true scale** and
keeps **20 on the compressed scale**, where the Moon is already drawn at 0.03 of
the map radius and twenty times is ample. At 1000 the lunar orbit comes out at
about **33 px** and traces a plain circle around the Earth.

`setScaleMode` re-clamps on the way out, or a reader who zoomed deep at true
scale and flicked to compressed would land at fifty times that scale's ceiling,
staring at empty parchment with no idea what had happened.

The wheel is exponential at 0.0016 per pixel, which needs some **forty notches**
to climb to 1000 — reachable in principle and not in practice. So `+` and `-`
zoom by half again per press, which gets there in seventeen and, with
auto-repeat, in one held key. This is a lecture tool; presenters already have
space and the arrows.

**At that magnification every planet is off the map.** A view that silently
loses them destroys the sense of direction the whole app exists to build, so
each off-screen body is drawn as a tinted chevron on the edge of the field with
its name beside it. `edgePointerFor()` in `render/orrery/offscreen.ts` places it
where the ray from the middle of the screen to the body crosses a rectangle
inset to `EDGE_INSET = 0.92` of the half-extents — inset because a chevron
placed exactly on the boundary is half eaten by the stage's overflow clip.

Three details that are easy to get wrong:

- **The ray is measured from the middle of the screen, not the frame origin.**
  A body renders at `centre + (p + pan) · unit`, so the map point under the
  crosshairs is `−pan`. Measuring from the origin would draw an edge pointer to
  a body sitting dead centre under a pan.
- **Which side it leaves through is not the larger component.** The field is
  usually wider than it is tall, so a body at 45° exits the top or bottom. Taking
  the smaller of the two ratios gets this right by construction.
- **The name is a separate element, not a child of the rotated chevron.** The
  first attempt counter-rotated the label inside the chevron to keep it upright;
  that is a net rotation of zero, so the box always extended *leftward in screen
  space* — inward on the right edge and straight off the map on the left. The
  name is instead placed at the same point and pushed 22px back along the
  outward unit vector the renderer already has, which behaves the same at every
  edge.

The extraction into a pure function was deliberate: projection arithmetic in
this project has a long record of looking right and being wrong, and
`offscreen.test.ts` pins the two properties that matter — the pointer is on the
ray to the body, and it lands *on* the inset rectangle rather than inside it —
for all 360 bearings, plus the pan term, which the browser cannot really
exercise (at 1000× a full drag across the screen moves the view by a thousandth
of a map unit). Measured in the browser at true scale, zoom 1000, Earth-centred:
all six off-screen bodies on the rectangle to within 1.5 px, all six names
wholly inside the field.

### 13.3d The scale bar exists only at true scale

A bar reading "1 AU" is a claim that a fixed run of pixels means a fixed
distance **anywhere on the map**. That holds for the true-scale projection,
which is a uniform scaling, and fails for the compressed one, which is
logarithmic — the same bar would stand for one distance beside Mercury and quite
another beside Saturn. So no bar is drawn on the compressed scale at all. This
is not an omission to be filled in later; there is no honest bar to draw.

Sized the way a chart's is: take a comfortable target width, ask what distance
it covers, round **down** to the nearest 1/2/5 x 10^n, and shorten the bar to
match. Rounding down rather than to nearest is what keeps the bar inside its
target, and a 1-2-5 sequence can never fall below 40% of it, so the bar is
always long enough to read as a bar.

**Pixels per AU is asked of `projectRadius`, not restated from the system
radius.** Changing the map's extent then carries the bar with it instead of
quietly making it a lie.

The unit switches to kilometres below 0.1 AU. AU is the map's native measure
and the one the app teaches in, so it wins wherever it stays legible — but once
the deep zoom of 13.3c brings the lunar orbit into view, the honest AU readings
are 0.002 and 0.005, numbers that convey nothing. At that range the bar reads
"1 000 000 km", which a reader can hold against the Moon's 384 400.

The bar is a **sibling of `.instrument`, not a child**. Inside it, the
pan-and-zoom transform would scale the bar along with the map it is measuring —
the one thing a scale bar must never do. It sits on a small panel-coloured chip
because the edge pointers run along the same bottom strip of the field and the
two would otherwise overlap illegibly at high magnification.

Verified across all four themes (the chip and ink resolve to sensible contrast
pairs in each) and at mobile width, where the target shrinks with the viewport.

### 13.3e Ptolemy's distances are in his own unit, not in AU

The Almagest parameters were checked against Toomer and are right: apogee,
eccentricity and epicycle radius for all five planets, the solar apogee 65;30
and e 2;30, and the Hipparchan lunar epicycle 5;15 for the model actually
implemented. The nested-sphere chain reproduces the Planetary Hypotheses
distance table to within 3-7% (Sun 1210 exact, Mars 5216 against 5040, Saturn
17830 against 17026).

What was wrong was the **unit the info panel printed**. It hard-coded AU for
every model, which for Ptolemy is an anachronism twice over: the unit did not
exist, and *the quantity was not determined*. Directions seen from the Earth do
not change when a deferent, its eccentricity and its epicycle are scaled
together, so nothing Ptolemy could observe would have fixed any absolute
distance, and he did not claim one. The Almagest states every measurement in
parts of that body's own deferent, which is always 60. That is what the panel
now shows, via `core/engines/ptolemaicUnits.ts`.

The unit's own catch has to be said out loud, so a note sits beside the figure:
**each body's 60 is a different real length**, so the readings cannot be
compared between bodies. That is the state of the question in the Almagest, not
a limitation of this app.

Two exclusions, both deliberate:

- **The reframe sub-mode keeps AU.** It is modern positions wearing geocentric
  dress rather than anything Ptolemy computed, so AU is exactly right for it.
  Only `ptolemaic-epicyclic` and `ptolemaic-almagest` switch.
- **The distance-from-the-Sun row disappears** under the two authentic modes.
  His construction determines one length — how far a body is from the Earth —
  and a Sun-relative figure would depend on where this app anchors the nested
  spheres, a modern choice made in `ptolemaic.ts`. Printing it beside his own
  numbers would dress that choice up as one of his findings. It first showed up
  as the Moon reading "24 104,7 parts from the Sun", which is arithmetically
  fine and historically meaningless.

`ptolemaicUnits.test.ts` checks the readout against the source text rather than
against the engine's own table: every planet's geocentric distance must stay
inside 60 +/- (e + r) and must reach both ends of it over thirty-two years. The
Moon comes out at 59.1 parts, which is Almagest IV's mean lunar distance of
about 59 Earth radii and one of the work's genuine successes.

### 13.4 Sight-lines are two segments, and why they bend

A sight-line runs **observer → body → zodiac ring**, as two segments rather than
one straight line. Drawn straight it can satisfy only one of its two jobs, and
the first version satisfied neither exactly.

Two independent distortions sit between the body and the ring:

1. **Parallax of a finite ring.** The ring's divisions are absolute ecliptic
   longitudes measured from the centre of the instrument, but apparent longitude
   is an angle measured *at the observer*. A line from an off-centre observer to
   the ring point at absolute λ does not point along λ. This affects both scales
   — it was leaving a 1.6–5.2° miss even at true scale, where a uniform scaling
   should preserve every angle exactly.
2. **Radial compression.** The compressed scale preserves directions only from
   the frame origin, so the drawn direction from Earth to a planet is not the
   true one. Up to about 27° for the inner planets.

Both vanish when the observer *is* the frame origin, which is why the lines are
dead straight in Ptolemy's geocentric view and only there. That is a real
geometric fact about the models rather than an implementation quirk, and it is
worth pointing out to students: the geocentric picture is the one in which the
sky and the map share a centre.

The two-segment form guarantees what matters — the line demonstrably connects the
observer to the body, and the pip lands at the body's true apparent longitude, so
the zodiac reading is exact. The bend at the body is the size of the distortion.
It is near-invisible at true scale, large under compression, and the UI says so
rather than leaving it looking like a defect.

Measured bend, 2026 epoch, observing from Earth with the Sun at the centre:

| | compressed | true scale |
|---|---|---|
| Mercury | 22.6° | 1.7° |
| Venus | 26.8° | 3.9° |
| Mars | 17.5° | 4.4° |
| Jupiter | 0.3° | 0.1° |

Saturn measures a large bend in both, but harmlessly: it sits almost on the ring,
so its outer segment is a stub a tenth of a unit long whose direction is
ill-conditioned and visually negligible.

#### The observer-centred sphere

The parallax term can be removed outright, and there is now a switch for it:
**Sféra kolem pozorovatele / Sphere on observer** draws the celestial sphere
around the observation point instead of concentric with the map.

The implementation is cheaper than it sounds. The ring's divisions are absolute
ecliptic longitudes whichever point they are measured from, so moving the sphere
onto the observer is a **pure translation of the ring already built** — no
rebuild, which is what makes it affordable every frame as the observer orbits.
The pips move with it and the sight-line collapses to a single straight ray.

With it on:

- The ray leaves the observer at the body's true apparent longitude and lands on
  the ring, in **every** model — the parallax between "direction λ from here" and
  "the point at angle λ on the ring" cannot arise when the ring is centred on
  here.
- The zodiac reading stays exact, for the same reason: a ray at bearing λ falls in
  the division spanning λ. Verified against the panel — Mercury's pip at bearing
  108° is 18° into Cancer, matching the reported 18.4° Rak.
- **At true scale the ray also passes exactly through the body.** That
  combination — one straight line from observer through planet to the right point
  on the zodiac — is the most faithful view the app can draw, and worth
  recommending for reading the sky.
- Under the compressed scale the ray still need not touch the marker, because
  compression distorts directions measured from anywhere but the frame origin.
  That residual is smaller than the old bend (0.1–12.7° against 22–27°) because
  only the compression term is left.

The costs, which is why it is a switch and not the default: the sphere is no
longer concentric with the instrument, and the map must **shrink** to keep an
off-centre ring from being clipped. `--ring-extent` is computed from the
observer's offset and quantised to 0.05 so the instrument does not breathe as
that offset varies — 1.90 observing from Earth, 2.45 from Saturn. The concentric
case keeps the stylesheet's own value untouched, so the default view is
unaffected by the feature existing.

### 13.4b Selecting a body emphasises where it appears

Nine sight-lines converge on the observer and nine pips sit around the ring, so
the one the reader actually asked about was no more visible than the rest.
Selecting a body now brings three things forward and drops everything else back:

- **its sight-line**, thickened and brought to full opacity while the others fade
  to about a third — driven by a `data-hasselection` flag on the instrument, so
  the unselected lines need no per-frame bookkeeping of their own;
- **its pip**, enlarged and filled rather than hollow, with the exact reading
  ("14.4 deg Beran") in a small badge beside it;
- **its sign**, lit on the ring — which is the reading a pre-telescopic
  astronomer would actually have written down.

The badge is nudged *inward*, along the vector from the pip to the centre of the
sphere. A fixed upward offset put it outside the ring, and possibly off the
element, whenever the body appeared near the top of the sky.

**The sign is emphasised by contrast and weight, not by hue**, and the first
attempt got this wrong in a way worth recording. Colouring the active label
`--brass-bright` works on the dark themes and is a disaster on the light ones:
measured against parchment it came to 1.50:1 where an ordinary label manages
6.26:1, so the *highlighted* sign was four times harder to read than its
neighbours. A light accent cannot emphasise on a light ground. Using
`--text-strong` with a brass rule underneath gives 11.3:1 on Parchment, 14.7 on
Atelier and 15.2 on Nocturne against 6.3, 8.1 and 10.0 for a plain label. LCARS
is the exception: its `--text-strong` is a deeper orange than its `--text`, so
contrast there goes down rather than up, but at 10:1 it is far past legible and
the weight and rule carry the emphasis instead.

#### The line always passes through the body

Both segments are now drawn in **both** sphere modes. With the sphere centred on
the observer the app used to draw a single straight ray from the observer to the
ring instead, on the grounds that it is geometrically the true direction — which
it is. But under the compressed scale that ray does not pass through the body's
marker, so the picture asserted a planet appears *there* while drawing the planet
somewhere else. **A line that misses the thing it points at is worse than a bent
one**, so the kink stays wherever the projection puts one.

The kink is not an artefact to hide: its size *is* the distortion the compressed
scale introduces. It shrinks to nothing at true scale, and to nothing in
Ptolemy's view where observer and centre coincide.

Verified across every combination — four models, both sphere modes, both scales:
the inner segment starts exactly at the observer, the two segments meet at the
body marker, and the outer ends exactly at the ring pip, all to floating-point
exactness (worst residual 3e-16 map units).

#### The ring grows to enclose the bodies

Concentric, the bodies live inside 1.0 and a ring at 1.06 clears them by
construction. Centred on the **observer** it does not: the observer is itself
offset — Earth sits 0.36 out at compressed scale — so a body on the far side can
be 1.36 away while the ring stays at 1.06. Saturn was being drawn *outside its
own sphere of fixed stars*, and its sight-line doubled back **166°** to
reach the ring.

That was always true. It only became visible once both segments were drawn in
this mode, and the fix belongs to the geometry rather than the line: the ring
layer is scaled per frame until it encloses the furthest body, quantised so the
instrument does not breathe as the observer moves, and pinned to 1 when
concentric so the default view is untouched. Measured worst kink afterwards:

| sphere | scale | worst kink | ring scale |
|---|---|---|---|
| centre | compressed | 18° | 1 |
| centre | true | 4° | 1 |
| observer | compressed | 37° | 1.20 |
| **observer** | **true** | **0.0000°** | **1** |

The last row is the one worth understanding. At true scale `projectVector`
reduces to a *uniform scaling*, which preserves directions, so the drawn
direction from observer to body is exactly the apparent longitude — and that is
where the ring intercept sits when the sphere is centred there. The same
direction twice, hence no kink at all. `scaleGeometry.test.ts` asserts that
equality to 1e-9, and asserts it fails at compressed scale, which is what the
remaining bend displays.

### 13.5 Two illumination displays, answering different questions

**The map** is a plan view, so a body's lit side is simply the half facing the
Sun and the terminator is a straight line through its centre — we see that great
circle edge-on from above. `--shadow-edge` is therefore fixed at 0.5 and only the
direction changes. Every body has one, the observer included: Earth is as much a
lit ball as anything else on the map.

The map aims the lit side at the **drawn** Sun rather than the true direction, so
the picture is self-consistent — the lit side visibly faces the Sun you can see.
Under the compressed scale those differ once the Sun is off-centre, since
compressing radii distorts angles measured from anywhere but the frame origin.

**The info panel** answers the different question of what an observer sees, and
needs a real terminator: seen from the observer that great circle is viewed
obliquely and projects to a **half-ellipse** of width |cos i|, not a straight
line. A straight edge reads as a bite out of the disc rather than a phase, so the
disc is built from a half-disc plus an ellipse that bulges outward when gibbous
and inward when crescent. This one uses true geometry, never the display frame:
recentring the map must not change the Moon's phase.

#### What the models actually say about phase

Phases come from the active engine, and the panel lists all three side by side.
Worst disagreement in lit fraction, 2026–2034 seen from Earth, percentage points:

| | vs reality (Copernicus) | vs reality (Ptolemy) | Ptolemy's own range |
|---|---|---|---|
| Mercury | 22.1 | **99.9** | 0–8% |
| Venus | 2.3 | **100.0** | 0–44% |
| Mars | 5.8 | 12.2 | 96–100% |
| Moon | 8.4 | **2.9** | 0–100% |

This is the one measurement where the geocentric model fails **completely**
rather than merely imprecisely, and the cause is the nested spheres (§12.5)
rather than the angular construction. With Venus penned inside the Sun's shell it
can never turn more than half its lit face toward Earth, so at superior
conjunction Ptolemy says crescent where the sky says full — a whole disc apart.

**Longitude and phase rank the models in opposite orders.** Ptolemy beats
Copernicus on where the planets appear (2.8° against 13.4° on Mars) and loses to
him absolutely on how they are lit. That is the shape of the seventeenth-century
argument in two rows of a table, and it is why the case was settled with a
telescope rather than with an ephemeris.

The Moon is the exception in Ptolemy's favour, being nobody's neighbour in the
shell ordering and so unpenalised by the nesting.
`illumination.test.ts` asserts all of this.

### 13.6 Overlays are all optional, and trails must not look like harness

Everything drawn over the bodies is annotation, grouped in one panel and each
switchable on its own: **trails**, the **construction** circles, **sight-lines**
to the zodiac, and the **star figures** on the ring.

Trails and harness are both thin lines, so they are deliberately separated on two
channels at once: a trail takes its body's colour and **fades with age**, giving
it a direction of travel; the harness is uniform brass. Colour alone would not
carry it — one faint line looks much like another — and neither would the fade.

### 13.7 The celestial sphere's star figures are ornament

The ring shows principal stars joined by figure lines, in the manner of an
engraved star chart. **Star positions are approximate and decorative.** The
app's real data is the computed body positions and the division boundaries;
the figures exist to make "apparent position against the stars" legible, and
are marked as such in the source so nobody later mistakes them for a catalogue.

Pictorial engravings — an actual ram, an actual bull — would need SVG artwork
or bitmaps and are therefore out of scope under the CSS-only constraint.

### 13.8 Still assumed, not confirmed

- **Deployment form** — building for a folder of static assets with a relative
  base path. A single-file inlined bundle is a small config change if needed.
- **Czech grammar** — declined forms stored per body, so generated event
  sentences read as correct Czech.
- **Observation point** — selectable to any body, Sun and Moon included.
