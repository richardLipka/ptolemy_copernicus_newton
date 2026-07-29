# Orrery — Ptolemy · Copernicus · Newton

An interactive 2D model of the solar system that runs the same sky through three
world-systems, so you can watch where they agree and where they part company.

Pick any body as the stationary point and every orbit redraws around it. Centre
the map on Earth and Mars traces the looping rosette that cost Ptolemy his
epicycles — not because the code knows what a retrograde loop is, but because
that is what the motion genuinely looks like from here.

No installation, no backend, no database. It builds to a folder of static files
and runs from any web server or straight off disk.

Czech and English · [Architecture notes](CLAUDE.md) · MIT licensed

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
- **Compare two models at once.** The ghost overlay draws a second model faintly
  beside the active one, so Copernicus's 13° error on Mars is a visible gap
  rather than a number.
- **Read the sky.** Sight-lines run from the observation point out to a zodiac
  ring, showing where each body *appears* as distinct from where it *is*. The
  ring switches between the twelve equal signs and the real IAU constellations,
  which have been drifting apart for two thousand years.
- **Compare predicted dates.** For any conjunction, opposition or station, the
  event panel shows the date each of the three models predicts and the spread
  between them.

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
