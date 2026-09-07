/**
 * The projection export builds its picture from, held to figures read back
 * from the running app.
 *
 * `mapProjection` and `ringGeometry` are the only parts of `mapSvg.ts` that
 * touch no DOM — everything else asks `getComputedStyle` for the current
 * theme's colours, which this suite's plain-Node environment cannot supply
 * (see `vitest.config.ts`). What is tested here is exactly the part that
 * decides *where* things land, which is also the part a silent regression
 * would be hardest to notice in: a wrong colour is obvious on screen, a wrong
 * scale quietly draws every body a few pixels from where the live map puts it.
 */

import { describe, expect, it } from 'vitest';

import { mapProjection, ringGeometry } from './mapSvg';
import type { OrreryView } from '../../state/selectors';
import type { State } from '../../state/store';

describe('mapProjection matches the running app', () => {
  it('reproduces a measured configuration', () => {
    // Read from the live app: a 558 × 372.90625 field, zoomed to
    // 1.6882783267986223, no pan. `instrument.style.getPropertyValue('--field')`
    // gave 361.7190625px there, which pins the `min(w,h) * 0.97` half of the
    // formula; `unitPx()` — `instrument.clientWidth / 2 * zoom` — gave a
    // corroborating ~209.1, confirming the two formulas the app carries agree
    // with each other and not just with themselves.
    const { unitPx, centre } = mapProjection(558, 372.90625, 1.46, 1.6882783267986223, 0, 0);

    expect(unitPx).toBeCloseTo(209.1378, 3);
    expect(centre).toEqual({ x: 279, y: 186.453125 });
  });

  it('centres on the field regardless of size, when there is no pan', () => {
    const { centre } = mapProjection(800, 600, 1.46, 1, 0, 0);
    expect(centre).toEqual({ x: 400, y: 300 });
  });

  it('moves the centre by pan times the scale it just computed', () => {
    const base = mapProjection(800, 800, 1.46, 2, 0, 0);
    const panned = mapProjection(800, 800, 1.46, 2, 3, -1.5);

    expect(panned.unitPx).toBe(base.unitPx);
    expect(panned.centre.x).toBeCloseTo(base.centre.x + 3 * base.unitPx, 6);
    expect(panned.centre.y).toBeCloseTo(base.centre.y - 1.5 * base.unitPx, 6);
  });

  it('scales with zoom and shrinks with a wider ring extent', () => {
    const narrow = mapProjection(800, 800, 1.46, 1, 0, 0);
    const zoomedIn = mapProjection(800, 800, 1.46, 3, 0, 0);
    const widerRing = mapProjection(800, 800, 2.0, 1, 0, 0);

    expect(zoomedIn.unitPx).toBeCloseTo(narrow.unitPx * 3, 6);
    expect(widerRing.unitPx).toBeLessThan(narrow.unitPx);
  });

  it('never lets a collapsed field shrink the scale to nothing', () => {
    // The floor `createOrrery` itself uses, so a docked-down window does not
    // divide by something close to zero.
    const { unitPx } = mapProjection(10, 10, 1.46, 1, 0, 0);
    expect(unitPx).toBeCloseTo(120 / 1.46 / 2, 6);
  });
});

const emptyView = (observerPoint = { x: 0, y: 0 }): OrreryView => ({
  bodies: [],
  ghosts: [],
  observerPoint,
  positions: new Map(),
});

const concentric = { sphereCentre: 'frame' } as unknown as State;
const observerCentred = { sphereCentre: 'observer' } as unknown as State;

describe('ringGeometry', () => {
  it('leaves the ring alone when the sphere is centred on the frame', () => {
    const geometry = ringGeometry(concentric, emptyView({ x: 5, y: 5 }));
    expect(geometry).toEqual({ sphere: { x: 0, y: 0 }, scale: 1, extent: 1.46 });
  });

  it('centres the ring on the observer once the sphere follows them', () => {
    const geometry = ringGeometry(observerCentred, emptyView({ x: 0.3, y: 0.1 }));
    expect(geometry.sphere).toEqual({ x: 0.3, y: 0.1 });
  });

  it('grows the ring only once a body would otherwise sit outside it', () => {
    // With every body close to the observer, 1.06 already clears them and the
    // scale should stay untouched — this is the case that must reproduce the
    // ordinary concentric view exactly, or Ptolemy's own map (observer ==
    // frame origin == Earth) would shift every time this path ran instead.
    const view: OrreryView = {
      bodies: [{ point: { x: 0.05, y: 0.05 } } as never],
      ghosts: [],
      observerPoint: { x: 0, y: 0 },
      positions: new Map(),
    };
    expect(ringGeometry(observerCentred, view).scale).toBe(1);
  });

  it('quantises the growth so the ring does not breathe continuously', () => {
    const view: OrreryView = {
      bodies: [{ point: { x: 2, y: 0 } } as never],
      ghosts: [],
      observerPoint: { x: 0, y: 0 },
      positions: new Map(),
    };
    const { scale } = ringGeometry(observerCentred, view);
    // Steps of 0.05, per the comment in orrery.ts this mirrors.
    expect(Math.round(scale / 0.05)).toBeCloseTo(scale / 0.05, 6);
    expect(scale).toBeGreaterThan(1);
  });
});

/*
 * The exporter is a second renderer, and the failure mode of having two is that
 * one of them learns a new trick.
 *
 * That is exactly what happened: the composition overlay was added to
 * `orrery.ts` and the SVG exporter knew nothing about it, so a map saved with it
 * switched on came back without it — and with the construction switch off, came
 * back with no machinery at all, because the export gated the whole block on
 * `showConstruction` where the live layer gates on either switch.
 *
 * Neither half of that is reachable from a unit test: `buildMapSvg` needs
 * `getComputedStyle` for the palette, and the environment here is plain Node.
 * What *is* reachable is the thing that actually went wrong — the two files
 * disagreeing about which view-model selectors get drawn. Source-level, and
 * crude, but it fails on the commit that introduces the divergence rather than
 * whenever somebody next opens the file.
 */
describe('the exporter draws everything the live renderer draws', () => {
  /*
   * Named one by one rather than fished out of a wildcard: the pattern has to
   * be a literal for Vite to inline it at all, and two exact paths say plainly
   * which files this rule is about.
   */
  const only = (modules: Record<string, unknown>): string => {
    const values = Object.values(modules);
    if (values.length !== 1) throw new Error('expected exactly one source file');
    return values[0] as string;
  };

  const liveSource = only(
    import.meta.glob('../orrery/orrery.ts', { query: '?raw', import: 'default', eager: true }),
  );
  const exportSource = only(
    import.meta.glob('./mapSvg.ts', { query: '?raw', import: 'default', eager: true }),
  );

  /** The `build*` selectors a file imports, which is what it can draw from. */
  const drawnWith = (text: string): string[] => {
    const match = text.match(
      /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*state\/selectors['"]/,
    );
    if (!match) return [];
    return match[1]!
      .split(',')
      .map((name) => name.trim().replace(/^type\s+/, ''))
      .filter((name) => name.startsWith('build'))
      .sort();
  };

  it('found both renderers', () => {
    expect(drawnWith(liveSource).length).toBeGreaterThan(2);
    expect(drawnWith(exportSource).length).toBeGreaterThan(2);
  });

  it('leaves no view-model behind', () => {
    const live = drawnWith(liveSource);
    const exported = drawnWith(exportSource);
    expect(live.filter((name) => !exported.includes(name))).toEqual([]);
  });

  it('gates the harness on either switch, as the live layer does', () => {
    const exporter = exportSource;
    // Both switches reach the export, not just the construction one.
    expect(exporter).toMatch(/state\.showConstruction\s*\|\|\s*state\.showRecentredHarness/);
    expect(exporter).toContain('buildRecentredHarness(state, selected)');
  });
});
