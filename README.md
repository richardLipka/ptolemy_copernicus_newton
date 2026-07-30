# Orrery — Ptolemy · Copernicus · Newton

An interactive 2D model of the solar system that runs the same sky through three
world-systems, so you can watch where they agree and where they part company.

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

> A live demo can be published by enabling GitHub Pages for this repository
> (Settings → Pages → Source → "GitHub Actions"); the workflow is already in
> place and will deploy on the next push to `main`.

---

## The point of it

Three models, one clock, one set of controls:

| | Ptolemy | Copernicus | Newton |
|---|---|---|---|
| Centre | Earth | Sun | anything you like |
| Orbits | deferents and epicycles | perfect circles | none — they emerge |
| Method | geometric construction | geometric construction | integrate the force law |

The headline result is one most people find backwards. Measured against an
accurate ephemeris across 1600–2400, here is the worst error in apparent
longitude each model makes:

| Body | Ptolemy | Copernicus | Newton |
|---|---|---|---|
| Mercury | 4.6° | 6.1° | <0.1° |
| Venus | 1.9° | 0.6° | <0.1° |
| Mars | **2.8°** | **13.4°** | <0.1° |
| Jupiter | **0.7°** | **6.9°** | 0.2° |
| Saturn | **2.5°** | **6.3°** | 0.5° |

**Ptolemy beats Copernicus on the superior planets.** *De revolutionibus* was
not more accurate than the *Almagest*. Heliocentrism alone bought no precision,
because circular orbits cost Copernicus more than geocentrism ever cost Ptolemy,
and that deadlock only broke when Kepler replaced the circles with ellipses.

This is asserted in the test suite, not just claimed in a table, so it cannot
quietly regress.

## What you can do with it

- **Move the centre.** Any body can be the stationary point in any model. The
  Ptolemaic and Copernican maps of the same instant are the same geometry seen
  from two chairs.
- **See the machinery.** In Ptolemy and Copernicus modes, select a body and the
  construction appears: deferent, epicycle, the arms carrying them, and the
  **equant** — the off-centre point about which the epicycle's centre sweeps
  equal angles in equal time. It is the cleverest device in the *Almagest* and
  it is invisible in the finished orbit.
- **See Newton's machinery too.** He places a body by force rather than by
  geometry, so the same switch draws vectors instead of circles: velocity, the
  net force, and every other body's gravitational pull, coloured by which body
  pulls, with exact magnitudes in newtons listed alongside. Select **Earth** and
  the Sun is 99.5% of the pull — which is why treating an orbit as a two-body
  ellipse works at all. Then select the **Moon**: the Sun pulls it more than
  twice as hard as Earth does (69.5% against 30.5%), and it orbits Earth anyway,
  because the two are falling toward the Sun together.
- **Compare two models at once.** The ghost overlay draws a second model faintly
  beside the active one, so Copernicus's 13° error on Mars is a visible gap
  rather than a number.
- **Watch the light.** On the map every body's lit hemisphere faces the Sun.
  Select one and the panel shows its phase *as seen from the observation point*,
  with a proper elliptical terminator — and what each of the three models
  predicts for it. Select **Mercury**: Newton, Copernicus and Ptolemy disagree
  by around twenty percentage points, because its eccentricity of 0.21 defeats a
  circle and an epicycle alike. On Venus they agree within four.
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
  event panel shows the date each of the three models predicts and the spread
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
Text contrast was measured, not eyeballed: 10:1 or better in all four.

## Running it

```bash
npm install && npm run dev
```

Other commands:

```bash
npm test          # 66 tests, mostly of the orbital mathematics
npm run typecheck # strict TypeScript, no emit
npm run build     # static output in dist/
```

The build writes relative asset paths, so `dist/` can be dropped into any
subdirectory (`/~user/orrery/`) without configuration. It makes no network
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

```
src/core/      engines, coordinates, events, zodiac — pure, no DOM, unit-tested
src/state/     store and derived view data
src/render/    the instrument and the panels
src/ui/        controls
src/i18n/      Czech and English
```

Graphics are **CSS only** — no `<canvas>`, no WebGL. Bodies, orbit paths, sight
lines and epicycles are DOM elements positioned by custom properties, styled as
an 18th-century brass orrery on parchment.

### Accuracy

The reference ephemeris uses JPL's Keplerian elements valid 3000 BC–3000 AD and
is checked against published values: Meeus's worked lunar example, the recorded
great conjunctions of 1603 and 1623 (correct to the day), the Mars oppositions
of 2018–2025, and the 2020 retrograde arc.

Newton mode integrates the force law with a 4th-order symplectic scheme. Its own
error stays an order of magnitude below the historical models', so a comparison
measures the models rather than the integrator.

Deliberate simplifications — Ptolemy's lunar crank, his latitude theory, and the
nested spheres — are listed in [CLAUDE.md §12.4](CLAUDE.md). The nested spheres
matter more than they sound: because this engine models Ptolemy's *angles* and
not his cosmology, Venus goes full here, so switching engines does **not**
reproduce Galileo's observation. That is the honest and sharper point — the
phases were decisive precisely because they attacked the one thing the
geocentric longitude machinery could never speak to.

## Licence

MIT — see [LICENSE](LICENSE).

---

# Orrery — Ptolemaios · Koperník · Newton

Interaktivní 2D model sluneční soustavy, který stejnou oblohu ukazuje ve třech
soustavách světa, takže je vidět, kde se shodují a kde se rozcházejí.

Jako nehybný bod lze zvolit kterékoli těleso a všechny dráhy se překreslí kolem
něj. Se Zemí ve středu opíše Mars smyčky, kvůli nimž Ptolemaios potřeboval
epicykly — ne proto, že by o nich program věděl, ale protože tak ten pohyb
odsud skutečně vypadá.

Žádná instalace, žádný server, žádná databáze. Výsledkem sestavení je složka
statických souborů.

### Oč jde

Nejzajímavější výsledek většina lidí nečeká. Proti přesné efemeridě v letech
1600–2400 dělá **Ptolemaios menší chybu než Koperník** u vnějších planet —
u Marsu 2,8° proti 13,4°. *De revolutionibus* nebylo přesnější než *Almagest*.
Samotný heliocentrismus přesnost nepřinesl, protože kruhové dráhy stály
Koperníka víc než Ptolemaia geocentrismus. Rozhodlo až Keplerovo nahrazení
kružnic elipsami.

### Co aplikace umí

- **Přesunout střed** — nehybným bodem může být kterékoli těleso v kterémkoli
  modelu.
- **Ukázat konstrukci** — v ptolemaiovském a koperníkovském režimu se po výběru
  tělesa zobrazí deferent, epicykl a **ekvant**, bod, kolem něhož se střed
  epicyklu pohybuje rovnoměrně.
- **Porovnat dva modely naráz** — druhý model se vykreslí slabě vedle aktivního.
- **Číst oblohu** — záměrné přímky z místa pozorování míří na pás zvěrokruhu
  a ukazují, kde těleso *vypadá*, na rozdíl od toho, kde *je*. Pás lze přepnout
  mezi dvanácti znameními a skutečnými souhvězdími IAU.
- **Srovnat předpovědi** — u každé konjunkce, opozice a zastávky je vidět datum,
  které předpovídá každý ze tří modelů, i rozdíl mezi nimi.

### Spuštění

```bash
npm install && npm run dev
```

Aplikace je plně lokalizovaná do češtiny a angličtiny; výchozím jazykem je
čeština.
