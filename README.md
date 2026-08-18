# Orrery — Ptolemy · Copernicus · Kepler · Newton

An interactive 2D model of the solar system that runs the same sky through four
world-systems, so you can watch where they agree and where they part company.

Sun, Mercury, Venus, Earth, Moon, Mars, Jupiter and Saturn — plus the four
Galilean moons and Titan, which keep their own time inside the larger system and
were the first thing anyone saw going round something other than the Earth.

Pick any body as the stationary point and every orbit redraws around it. Centre
the map on Earth, run the clock, and Mars accumulates the looping rosette that
cost Ptolemy his epicycles — not because the code knows what a retrograde loop
is, but because that is where Mars was actually seen to go.

Orbits are **logged, not predicted**. Nothing is computed ahead of the clock: a
trail is a record of positions the simulation genuinely passed through, so it
cannot show a shape the model did not produce. The map therefore starts bare and
fills in as time runs.

No installation, no backend, no database. It builds to a folder of static files
and runs from any web server or straight off disk.

Czech and English · four looks · [Architecture notes](CLAUDE.md) · MIT licensed

**[Try it live →](https://richardlipka.github.io/ptolemy_copernicus_newton/)**

---

## The point of it

Four models, one clock, one set of controls:

| | Ptolemy | Copernicus | Kepler | Newton |
|---|---|---|---|---|
| Centre | Earth | Sun | Sun, at a focus | anything you like |
| Orbits | deferent, eccentric, equant, epicycle | eccentric circle plus a small epicyclet | ellipses | none — they emerge |
| Method | geometric construction | geometric construction | geometric construction | integrate the force law |

Measured against an accurate ephemeris across 1600–2400, here is the worst error
in apparent longitude each model makes:

| Body | Ptolemy | Copernicus | Kepler | Newton |
|---|---|---|---|---|
| Mercury | 4.6° | 0.80° | 0.005° | 0.02° |
| Venus | 1.9° | 0.01° | 0.007° | 0.02° |
| Mars | **2.8°** | **0.33°** | **0.03°** | 0.04° |
| Jupiter | 0.6° | 0.13° | 0.15° | 0.19° |
| Saturn | 2.6° | 0.29° | 0.35° | 0.58° |

**Heliocentrism on its own bought almost nothing.** Copernicus and Ptolemy are
in the same bracket, and for the same reason: both place a planet with an
eccentric circle and a second circle to correct it, and both cost the same two
table look-ups to work by hand. *De revolutionibus* won its argument on
simplicity and coherence — one epicyclet where Ptolemy needs a large epicycle
and an equant — not on precision.

One caveat the app is careful about: this comparison is **not symmetric**. The
Ptolemaic engine runs on Almagest parameters and so carries Ptolemy's own
measurement errors, while the Copernican engine runs on modern ones and shows
his construction at its best. Copernicus's own figures were no better than
Ptolemy's, so the real *Prutenic Tables* were not the improvement this table
suggests. Read it as "the same order", never as "Copernicus won".

**It took Kepler's ellipse to break the deadlock** — 0.33° to 0.03° at Mars, on
the same heliocentric arrangement, changing nothing but the shape of the orbit.
Newton then arrives at much the same numbers from an entirely different
direction, deriving from a force law what Kepler had to fit to Tycho's
observations.

> An earlier version of this project modelled Copernicus with **concentric**
> circles and no eccentricity, which put Mars 13.5° out and made it look as
> though Ptolemy beat him soundly. That was an artefact: *De revolutionibus* is
> eccentrics and epicyclets from end to end. The bare circle is still available
> as a second sub-mode, where it answers a real question — how much of an
> orbit's shape the eccentricity alone accounts for — rather than standing in
> for Copernicus.

This is asserted in the test suite, not just claimed in a table, so it cannot
quietly regress.

## What you can do with it

- **Move the centre.** Any body can be the stationary point in any model. The
  Ptolemaic and Copernican maps of the same instant are the same geometry seen
  from two chairs. The mouse wheel zooms about whatever you have made the centre,
  as do the `+` and `-` keys; double-click returns to the fitted view. On the
  realistic scale the zoom goes as far as a thousand times, which is what it
  takes to separate the Moon from the Earth and watch it go round — everything
  else is off the map by then, so each body left behind is drawn as a pointer on
  the edge showing the direction to it. A scale bar along the bottom says what
  the distances amount to — in AU across the planetary view, in kilometres once
  you are down among the lunar orbit. It appears only on the realistic scale,
  because the compressed one is logarithmic and no single bar could be true of
  it.
- **See what an observer would have written down.** The *sky track* draws the
  selected body's position among the stars against time — the record every
  pre-telescopic astronomer actually kept. Where the curve doubles back, the
  planet is retrograde; that shape is the single phenomenon both Ptolemy's
  epicycle and Copernicus's moving Earth were built to reproduce, and switching
  model redraws it.
- **See the machinery.** In Ptolemy and Copernicus modes, select a body and the
  construction appears: deferent, epicycle, the arms carrying them, and the
  **equant** — the off-centre point about which the epicycle's centre sweeps
  equal angles in equal time. It is the cleverest device in the *Almagest* and
  it is invisible in the finished orbit.
- **Ask any part of it what it is.** Hover a circle, an arm, a marker or a force
  vector and a card says what that part does in the model that is running, with
  its figures for the date on screen — in Ptolemy's own parts of 60, sexagesimal
  beside the decimal, exactly as the *Almagest* states them. Hover the equant and
  the two rates are there together: 0.524°/day uniform about it, 0.639°/day about
  the Earth, which is the whole reason it exists. Hover Mars's epicycle and its
  r/R of 39;30 to 60 is read out as the distance from the Sun it implies —
  **1.519 AU against a true 1.524** — a figure Ptolemy wrote down for all five
  planets without any way of knowing what he had.
- **See Newton's machinery too.** He places a body by force rather than by
  geometry, so the same switch draws vectors instead of circles: velocity, the
  net force, and every other body's gravitational pull, coloured by which body
  pulls, with exact magnitudes in newtons listed alongside. Select **Earth** and
  the Sun is 99.4% of the pull — which is why treating an orbit as a two-body
  ellipse works at all. Then select the **Moon**: the Sun pulls it about twice as
  hard as Earth does — near 69% against 31%, with the ratio breathing between 1.9
  and 2.5 across a year — and it orbits Earth anyway, because the two are falling
  toward the Sun together.
- **Compare two models at once.** The ghost overlay draws a second model faintly
  beside the active one, so Ptolemy's 2.8° at Mars is a visible gap rather than a
  number — and the bare-circle sub-mode's 13.5°, which is what heliocentrism
  looks like with the eccentrics taken out, is an unmissable one.
- **Watch the light.** On the map every body's lit hemisphere faces the Sun.
  Select one and the panel shows its phase *as seen from the observation point*,
  with a proper elliptical terminator — and what each of the four models
  predicts for it. The heliocentric three agree closely: indistinguishable on
  Venus, within two percentage points on Mercury. Ptolemy is the outlier, and not
  by a little — his Venus never passes 44% lit and his Mercury never passes 8%,
  where the sky takes both to full. That gap is the phases of Venus, and it is
  the one place in the app where a model is not merely inaccurate but refuted.
- **Read the sky.** Sight-lines run from the observation point out to a zodiac
  ring, showing where each body *appears* as distinct from where it *is*. The
  ring switches between the twelve equal signs and the real IAU constellations,
  which have been drifting apart for two thousand years.
- **Put the sky where it belongs.** The celestial sphere can be drawn concentric
  with the map, as on a traditional orrery, or **around the observation point**.
  The second is geometrically the honest one: sight-lines become single straight
  rays at the true apparent longitude in every model, and at true scale they pass
  exactly through the planet on their way to the zodiac. The cost is a sphere no
  longer centred on the instrument.
- **Switch off anything you don't want.** Trails, construction, sight-lines and
  star figures are all optional annotation, each with its own switch. Trails take
  their body's colour and fade with age; the harness is brass and uniform, so the
  record of where something went never reads as part of the machinery.
- **Compare predicted dates.** For any conjunction, opposition or station, the
  event panel shows the date each of the four models predicts and the spread
  between them.

## Four looks

The map runs full-bleed with the controls floating over it, and the top-right bar
switches language and theme. Your choice of both is remembered.

- **Parchment** — brass instrument on paper, c. 1750. Engraved hairlines, hard
  edges, no depth, because a printed plate has none.
- **Atelier** — the same pigments as a modern instrument: near-white ground, UI
  sans for anything functional, soft elevation instead of ruled borders.
- **Night** — the same instrument by candlelight. A dark theme *in period* rather
  than a modern dark mode: warm lamplight on metal against a sky-black ground,
  with the brass lifted above its background instead of darkened, or the
  engraving would vanish.
- **LCARS** — after the Okudagram. Black ground, flat saturated blocks, block
  capitals, asymmetric elbows.

Every look is a block of CSS custom properties and nothing else, so the body
colours stay comparable between them and adding a fifth means adding one file.

Text contrast is measured rather than eyeballed, and the measurement is not
uniformly flattering: headings run 9:1 to 16:1 across the four themes and control
labels 6:1 to 13:1, but the muted small type is weaker — panel titles and the
credit line sit at 3.1:1 on Parchment, below the 4.5:1 that type that size wants.
That is the low-contrast engraving the theme is imitating working against
legibility rather than for it, and it is the next thing to fix in the palette.

## Sharing a setup

The address bar tracks the arrangement, so a link reopens it:

```
#model=ptolemy&type=ptolemaic-almagest&centre=earth&observer=mars&sphere=observer&date=1610-01-07
```

Model, sub-mode, stationary point, observation point, where the celestial sphere
is centred, and the date. Paste one into a slide and it comes back as you left
it.

Every field is optional, so `#observer=jupiter&date=1610-01-07` is a perfectly
good link — anything absent stays as the reader had it. Zoom, theme and language
are deliberately left out: zoom is a way of looking rather than a thing to look
at, and the other two belong to whoever opens the link.

## Running it

```bash
npm install && npm run dev
```

Other commands:

```bash
npm test          # ~400 tests, mostly of the orbital mathematics
npm run typecheck # strict TypeScript, no emit
npm run build     # static output in apps/orrery/dist/
```

The build writes relative asset paths, so `apps/orrery/dist/` can be dropped into
any subdirectory (`/~user/orrery/`) without configuration. It makes no network
requests at runtime and works offline once loaded.

## How it is built

Four concerns are kept apart, and that separation is what makes the comparison
possible:

1. **Position engine** — how a body's position is computed.
2. **Frame origin** — which body is pinned at the centre of the map.
3. **Observation point** — where the sight-lines start from.
4. **Projection** — how positions become pixels and zodiac angles.

Frame origin and observation point are independent. Copernicus centres the Sun
but you still observe from Earth, and that gap between where things are and
where they appear is the whole subject.

The repository is an npm workspace with the calculation split out as a package,
so other projects can depend on the models without the app around them:

```
packages/core/       @orrery/core — bodies, engines, coordinates, events,
                     zodiac. No DOM, no framework, no runtime dependencies;
                     compiled without the DOM lib so the boundary is a
                     compile error rather than a convention.
apps/orrery/
  src/state/         store and derived view data
  src/render/        the instrument and the panels
  src/ui/            controls
  src/i18n/          Czech and English
```

`npm install` at the root wires the two together; `npm run dev`, `npm test` and
`npm run build` all work from there.

### Using the models elsewhere

Every module is importable on its own, which matters because the engines are
meant to be used separately:

```ts
import { BODIES, jdFromCalendar } from '@orrery/core';
import { keplerianPositions } from '@orrery/core/engines/keplerian';
import { ptolemaicGeometryFor } from '@orrery/core/engines/ptolemaic';
```

Reaching for one engine costs one engine. A bundle that imports only Kepler
comes to 13 kB and contains no trace of the VSOP87 tables, the equant or the
n-body integrator; importing `@orrery/core/engines/registry`, which carries all
eight, comes to 168 kB. The package sets `sideEffects: false`, so a bundler
drops whatever is not reached.

Graphics are **CSS only** — no `<canvas>`, no WebGL. Bodies, orbit paths, sight
lines and epicycles are DOM elements positioned by custom properties, styled as
an 18th-century brass orrery on parchment.

### Accuracy

The reference ephemeris is **VSOP87** (variant B, referred to J2000), truncated
to 2175 terms — sub-arcsecond over the supported range of 1600–2400. It is
checked against published values: Meeus's worked example for Venus, the recorded
great conjunctions of 1603 and 1623 (correct to the day), the Mars oppositions
of 2018–2025, and the 2020 retrograde arc. Against published event times it
lands within about ten minutes, including the December 2020 great conjunction —
the hardest case, because Jupiter and Saturn close so slowly that a small
angular error becomes a large error in time.

Event times are therefore shown to the hour and mean it.

Newton mode integrates the force law with a 4th-order symplectic scheme. Its own
error stays an order of magnitude below the historical models', so a comparison
measures the models rather than the integrator.

Ptolemy's deferents are scaled to his **nested spheres** — each planet's shell
beginning where the one below it ends, as the *Planetary Hypotheses* has it. The
Almagest fixes only the ratio r/R, and scaling a deferent, its eccentricity and
its epicycle together leaves the direction from Earth untouched, so this changes
the model's distances without altering a single longitude. It is what turns the
engine from a calculating device into a physical claim: Mercury and Venus lie
always between Earth and the Sun, the superior planets always beyond it.

That is also what lets the app re-run the observation that settled the argument.
Select Venus and switch between Ptolemy and Newton: penned inside the Sun's
shell, Ptolemy's Venus never exceeds 44% lit, so the model says crescent where
the sky says full. Note the direction of the two verdicts — Ptolemy's longitudes
*beat* Copernicus's, so the case could not be made on where the planets appear.
It was made on how they are lit.

Ptolemy comes in three sub-modes. Two share his geometry and differ only in where
the angles come from: **modern mean longitudes**, which isolate the error in his
construction, or **his own tables from the Almagest** — what a second-century
astronomer would actually have computed. The third recentres accurate positions
on Earth, showing what he was approximating.

Switching between the first two gives a result worth pausing on. His mean motions
are excellent — good to a part in a hundred thousand, from Babylonian records
spanning centuries — yet carried nineteen centuries forward they move Venus by
22° and Mercury by 12°, while Mars and Saturn shift barely a degree. The
difference is not accuracy but arithmetic: a fractional error in a period is paid
once per revolution, and Venus has gone round three thousand times since 137 AD
where Saturn has managed sixty-four.

Remaining simplifications — Ptolemy's lunar crank and his latitude theory — are
listed in [CLAUDE.md §12.4](CLAUDE.md).

## Licence

MIT — see [LICENSE](LICENSE).

---

# Orrery — Ptolemaios · Koperník · Kepler · Newton

Interaktivní 2D model sluneční soustavy, který stejnou oblohu ukazuje ve čtyřech
soustavách světa, takže je vidět, kde se shodují a kde se rozcházejí.

Jako nehybný bod lze zvolit kterékoli těleso a všechny dráhy se překreslí kolem
něj. Se Zemí ve středu opíše Mars smyčky, kvůli nimž Ptolemaios potřeboval
epicykly — ne proto, že by o nich program věděl, ale protože tak ten pohyb
odsud skutečně vypadá.

Žádná instalace, žádný server, žádná databáze. Výsledkem sestavení je složka
statických souborů.

### Oč jde

**Samotný heliocentrismus přesnost téměř nepřinesl.** Koperník i Ptolemaios jsou
ve stejném pásmu, a ze stejného důvodu: oba umísťují planetu excentrickou
kružnicí a druhou kružnicí, která ji opravuje, a oba stojí stejná dvě nahlédnutí
do tabulek. *De revolutionibus* si svůj spor vyhrálo jednoduchostí — jeden malý
epicykl tam, kde Ptolemaios potřebuje velký epicykl a ekvant — nikoli přesností.

Srovnání ovšem **není symetrické**: ptolemaiovský stroj běží na parametrech
z Almagestu, a nese tedy Ptolemaiovy chyby měření, zatímco koperníkovský běží na
moderních a ukazuje jeho konstrukci v nejlepším světle. Koperníkovy vlastní
hodnoty nebyly lepší než Ptolemaiovy.

Rozhodlo až Keplerovo nahrazení kružnic elipsami: u Marsu z 0,33° na 0,03°,
při stejném heliocentrickém uspořádání. Nerozhodl střed, ale tvar dráhy.

| Těleso | Ptolemaios | Koperník | Kepler | Newton |
|---|---|---|---|---|
| Merkur | 4,6° | 0,80° | 0,005° | 0,02° |
| Venuše | 1,9° | 0,01° | 0,007° | 0,02° |
| Mars | **2,8°** | **0,33°** | **0,03°** | 0,04° |
| Jupiter | 0,6° | 0,13° | 0,15° | 0,19° |
| Saturn | 2,6° | 0,29° | 0,35° | 0,58° |

### Co aplikace umí

- **Přesunout střed** — nehybným bodem může být kterékoli těleso v kterémkoli
  modelu.
- **Ukázat konstrukci** — po výběru tělesa se zobrazí jeho mechanismus:
  u Ptolemaia deferent, epicykl a **ekvant**, bod, kolem něhož se střed epicyklu
  pohybuje rovnoměrně; u Koperníka **excentr s posunutým středem a malý epicykl**,
  jímž nahradil ekvant; u Keplera elipsa s **oběma ohnisky** — v jednom je Slunce,
  ve druhém není nic — a průvodič; u Newtona vektory sil a rychlosti.
- **Porovnat dva modely naráz** — druhý model se vykreslí slabě vedle aktivního.
- **Číst oblohu** — záměrné přímky z místa pozorování míří na pás zvěrokruhu
  a ukazují, kde těleso *vypadá*, na rozdíl od toho, kde *je*. Pás lze přepnout
  mezi dvanácti znameními a skutečnými souhvězdími IAU.
- **Srovnat předpovědi** — u každé konjunkce, opozice a zastávky je vidět datum,
  které předpovídá každý ze čtyř modelů, rozdíl mezi nimi i skutečný čas podle
  moderní efemeridy VSOP87.

### Spuštění

```bash
npm install && npm run dev
```

Aplikace je plně lokalizovaná do češtiny a angličtiny; výchozím jazykem je
čeština.
