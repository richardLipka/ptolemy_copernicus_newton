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

Czech and English · five looks · [Architecture notes](CLAUDE.md) · MIT licensed

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
- **See what an observer would have written down.** The *sky track* tab in the
  bottom evidence drawer plots the selected body's longitude among the stars
  against time — the record every pre-telescopic astronomer actually kept. Where
  the curve doubles back, the planet is retrograde; when comparison is active,
  rival models' tracks draw faintly behind the active curve so you can see
  Ptolemy's epicycle and Copernicus's moving Earth trace the same loop.
- **Watch a heliocentric model turn into Ptolemy's.** Under Copernicus or Kepler,
  use the one-click **View from Earth as epicycles** button (or hold any non-Sun
  body still) to enable the **Composition** overlay. It draws the model's own
  two orbits chained end to end — showing the live vector equation beside the
  toggle — and their sum lands exactly on the planet the engine already placed.
  What that chain looks like on screen is a deferent carrying an epicycle.
  Hovering any dashed leg (or clicking it under *Model machinery*) identifies
  which body's orbit it is and prints its semi-major axis and ratio.

  The only rule is that the larger orbit is the deferent, and it reproduces the
  *Almagest*'s own split without being told to. Hold the **Earth** still and pick
  **Venus**: the Sun carries the epicycle, which is exactly how Ptolemy lays out
  an inferior planet — and how Tycho laid out everything. Pick **Mars** instead
  and the deferent is Mars's own orbit, the epicycle riding it is the Earth's
  orbit reversed, and nothing at all sits at the joint. That is Ptolemy's
  superior planet, and it is why his epicycle arm always stayed parallel to the
  direction of the Sun: the arm *is* the Earth's orbit, in a model that did not
  know the Earth had one.

  The point is not that Ptolemy was right. It is that the disagreement was never
  about the geometry — only about which body to hold still.
- **See the machinery — and ask any part what it is.** In Ptolemy and Copernicus
  modes, select a body and the construction appears: deferent, epicycle, arms,
  and the **equant**. Hover a circle, an arm, a marker, a dashed composition
  leg, or a force vector on the map — or click any chip under **Model machinery**
  in the right-hand inspector — to read what that part does in the active model
  and what it measures on the current date, in Ptolemy's own parts of 60
  (sexagesimal beside decimal) or AU. Hover the equant and the two rates appear
  together (0.524°/day uniform about it, 0.639°/day about Earth); hover Mars's
  epicycle and its r/R of 39;30 to 60 reads out as the heliocentric distance it
  implies — **1.519 AU against a true 1.524** — a figure Ptolemy wrote down for
  all five planets without knowing what he had.
- **See Newton's machinery too.** He places a body by force rather than by
  geometry, so the same switch draws vectors instead of circles: velocity, the
  net force, and every other body's gravitational pull, coloured by which body
  pulls, with exact magnitudes in newtons listed alongside. Select **Earth** and
  the Sun is 99.4% of the pull — which is why treating an orbit as a two-body
  ellipse works at all. Then select the **Moon**: the Sun pulls it nearly twice
  as hard as Earth does (~65–69% against ~31–35%, breathing between 1.9× and
  2.5× across a year), and the inspector highlights why it orbits Earth anyway —
  both fall toward the Sun together.
- **Run eight guided decisive trials.** Click **★ Trials** in the top bar to
  jump straight to the historical moments that test both halves of the argument:
  *Same reality, different machinery* (Mars composition in 2027, Mars opposition
  of 1602) and *What newer models predict that older ones cannot* (Galileo's
  gibbous Venus in 1610, the Galilean moons of Jupiter in 1610, the 1631 Mercury
  transit, the great conjunctions of 1603 and 2020, and the Moon's wandering
  ellipse). A dismissible banner at the top of the stage explains the test and
  offers one-click actions to flip models or open the sky view.
- **Every name in the explanations is a link.** Ptolemy, Tycho, the *Rudolphine
  Tables*, Gassendi watching a transit in Paris — people, books, places and
  planets carry a faint dotted underline out to Wikipedia, in the language the
  app is set to. The dictionaries stay plain text: the names are matched against
  a table rather than marked up by hand, so translating a sentence cannot break
  a link. Czech is matched by stem, because it declines — Ptolemaios turns up as
  Ptolemaia, Ptolemaiovi and Ptolemaiovými, and all of them should point at the
  same man.
- **Look at the sky itself — and compare capabilities side by side.** The
  unified bottom evidence drawer switches cleanly between **Observer's sky**,
  **Sky track**, and the live **Model scorecard**:
  - *Observer's sky* plots the bright J2000 stars within 35° of the ecliptic,
    every body in the field, sign boundaries, and the ecliptic to one angular
    scale (scroll over the band or pick `40° | 12° | 4° | 1°`). When **Compare**
    is active, dashed model-tinted outlines show where rival models place the
    same body — with their own phases and ecliptic latitudes — and at narrow
    fields (`≤ 12°`) the Sun is drawn at true angular diameter so Kepler's 1631
    Mercury transit sits visibly on the solar disc while Ptolemy misses by 5°.
  - *Model scorecard* lines up all four models side by side for the selected
    body across apparent longitude (`Δ` vs VSOP87), illuminated phase (flagging
    Ptolemy's `≤ 44%` / `≤ 8%` cap), distance & scale (`parts` vs `AU`),
    ecliptic latitude (`0°` flat vs inclined), and mechanism / net force.
- **Save the map, or a body's phase, as an image.** SVG or PNG, from **Export**
  in the top bar (for the map exactly as it stands) or right inside the phase
  card (for the selected body's phase disc). Real vector shapes rather than a
  DOM snapshot, so SVG opens as editable geometry and PNG rasterises cleanly at
  print resolution.
- **Compare two or all four models at once.** **Compare** in the top bar draws
  any rival model — or all four at once — as colour-coded ghosts on the map, in
  Observer's sky, and on the Sky track, so Ptolemy's 2.8° at Mars or bare
  circles' 13.5° is a visible gap rather than an abstract number.
- **Watch the light and the scale.** The app opens with **Venus pre-selected**
  and puts a clickable **4-model phase disc strip** plus a **4-model distance &
  scale table** at the top of the right-hand inspector. On Venus and Mercury, an
  automatic refutation callout appears whenever Ptolemy's nested-sphere cap
  (`≤ 44%` / `≤ 8%`) contradicts the gibbous/full heliocentric disc, and
  Ptolemy's dimensionless `parts of 60` (`no absolute AU`) sits directly beside
  the heliocentric models' `AU` distances.
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
- **Switch off anything you don't want.** Trails, construction/forces,
  sight-lines and star figures are all optional annotation in a symmetric left
  settings rail, with a `?` button on each panel to reveal explanations only
  when wanted. Trails take their body's colour and fade with age; the harness is
  brass and uniform, so the record of where something went never reads as part
  of the machinery.
- **Compare predicted dates — and search ahead.** The **Events** tab lists
  upcoming conjunctions, oppositions and retrograde stations with live
  cross-model spread badges (`Δ days`), expands to show every model's predicted
  time beside the VSOP87 reference, and includes an on-demand **Find next
  event** search scanning up to 10 years ahead.

## Layout and five looks

The map runs full-bleed inside a Stage-First layout: a single-row **Top Command
Bar** holds the four models, **Compare**, **★ Trials**, **∑ Working**, a
dedicated **`CZ | EN`** language switch, global `ⓘ` explanations, **Export**,
and `⚙` for theme and zodiac scheme. Symmetric settings sit on the **left**
(with per-panel `?` explanations on demand), the tabbed **Details | Events**
inspector sits on the **right**, playback and date controls float in a compact
**bottom-center** pill, the unified **Evidence Drawer** docks cleanly above it,
and credits sit quietly in the **bottom-right** corner. Your choice of language
and theme is remembered.

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
- **Flightdeck** — the glass cockpit. Near-black ground, the chrome dim and blue,
  and the bodies pitched as far the other way as the palette allows: on this one
  a planet should be the brightest thing on screen by a wide margin, because it
  is the only thing that is real. Corners near-square, so a panel reads as a
  region of a display rather than an object on a desk.

Every look is a block of CSS custom properties and nothing else, so the body
colours stay comparable between them and adding a sixth means adding one file.

Text contrast is measured rather than eyeballed across all five themes:
headings run 10:1 to 18:1, control labels 6:1 to 14:1, and muted small type
(panel titles and the credit line) runs 4.7:1 to 5.5:1 against each theme's
surface (5.3:1 on Parchment, 4.5:1 even over its shaded corner). Engraved ring
hairlines run 3.8:1 to 6.2:1.

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
npm test          # 536 tests, covering orbital mathematics, trials, i18n and view logic
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
  src/render/        the instrument, inspector, events, evidence drawer & scorecard
  src/ui/            top command bar, symmetric settings rail, time pill, trials & overlays
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
shell, Ptolemy's Venus never exceeds 44% lit — 43.8% at its fullest — so the
model says crescent where the sky says full. That is why the case was settled on
how the planets are *lit* rather than on where they appear: in longitude the two
systems sit in the same bracket, far too close for any pre-telescopic observation
to separate them, and Ptolemy's own tables were no worse in practice than the
Copernican ones anybody actually used.

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
- **Sledovat, jak se z heliocentrického modelu stane ten Ptolemaiův** — u Koperníka
  a Keplera lze při jiném nehybném bodě než Slunci zapnout překrytí **Skládání**.
  Vykreslí dvě dráhy, které model už zná, navázané za sebou; jejich součet padne
  přesně tam, kam těleso postavil sám model. Výsledný obrazec je deferent nesoucí
  epicykl. Platí jediné pravidlo — větší dráha je deferent — a to samo od sebe
  reprodukuje dělení, které dělá už *Almagest*: se Zemí ve středu nese u Venuše
  epicykl Slunce (tak to má Ptolemaios u vnitřních planet a Tycho u všech),
  zatímco u Marsu je deferentem dráha Marsu a epicyklem obrácená dráha Země,
  v jejich kloubu neleží nic — a právě proto zůstávalo Ptolemaiovo rameno epicyklu
  rovnoběžné se směrem ke Slunci. Nejde o to, že by měl Ptolemaios pravdu, ale
  o to, že spor nikdy nebyl o geometrii, nýbrž o to, které těleso zastavit.
- **Porovnat dva nebo všechny čtyři modely naráz** — tlačítko **Porovnat**
  v horní liště vykreslí ostatní modely na mapě, v pohledu na oblohu i v dráze
  na obloze.
- **Spustit osm rozhodujících zkoušek** — tlačítko **★ Zkoušky** v horní liště
  přenese mapu rovnou do historických okamžiků rozdělených na *Tatáž realita,
  jiný mechanismus* (skládání Marsu 2027, opozice Marsu 1602) a *Co novější
  modely předpoví a starší nemohou* (fáze Venuše 1610, Galileovy měsíce
  Jupiteru 1610, přechod Merkuru přes Slunce 1631, velké konjunkce 1603 a 2020,
  putující elipsa Měsíce).
- **Srovnat fáze, měřítko i schopnosti modelů** — pravý panel detailu otevírá
  rovnou srovnání fází všech čtyř modelů (včetně upozornění na vyvrácení
  Ptolemaiovy Venuše a Merkuru), srovnání vzdálenosti v dílech ku 60 proti AU a
  interaktivní čipy mechanismu; spodní panel **Důkazy na obloze** pak přepíná
  mezi pohledem na oblohu, dráhou na obloze a přehlednou tabulkou **Schopnosti
  modelů**.
- **Číst oblohu** — záměrné přímky z místa pozorování míří na pás zvěrokruhu
  a ukazují, kde těleso *vypadá*, na rozdíl od toho, kde *je*. Pás lze přepnout
  mezi dvanácti znameními a skutečnými souhvězdími IAU.
- **Srovnat předpovědi a vyhledat příští úkaz** — záložka **Úkazy** zobrazuje
  nadcházející konjunkce, opozice a zastávky s náhledem rozptylu modelů (`Δ dny`),
  úplným srovnáním proti moderní efemeridě VSOP87 i vyhledáváním příštího úkazu
  až na 10 let dopředu.

### Spuštění

```bash
npm install && npm run dev
```

Aplikace je plně lokalizovaná do češtiny a angličtiny; výchozím jazykem je
čeština. Přepínač **`CZ | EN`** je přímo v horní liště vedle volby modelů,
porovnání, zkoušek a exportu; vzhled a zvěrokruh najdete pod ozubeným kolem `⚙`,
symetrické nastavení vlevo (s vysvětlením na vyžádání pod tlačítkem `?` na
každém panelu), detail tělesa a úkazy vpravo a ovládání času dole uprostřed.
