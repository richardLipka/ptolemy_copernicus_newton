/**
 * The camera move the double-click shortcut lands on.
 *
 * The one it must never make is changing the stationary point: that is a claim
 * about the model, and rebuilding the system around whatever a reader wanted a
 * closer look at would rewrite every other body's path. Two quieter faults are
 * pinned too — framing a body that has nothing round it by dividing by zero, and
 * "framing the system" of the Sun, which every planet names as its parent, by
 * zooming *out* until Saturn fits.
 */

import { describe, expect, it } from 'vitest';

import { focusViewFor, projectPositions } from './selectors';
import { ENGINES, MIN_ZOOM, Store, maxZoomFor } from './store';
import type { ScaleMode } from './store';
import type { BodyId } from '../core/bodies';

const stateWith = (scaleMode: ScaleMode) => {
  const store = new Store();
  store.setScaleMode(scaleMode);
  return store.get();
};

/**
 * Drawn separation between a body and one of its moons, in map-radius units.
 *
 * Projected about the state's *own* frame origin, which is what the function
 * under test reads — the Moon's drawn radius is capped against Mercury's gap and
 * so is not quite frame-independent.
 */
function reachOf(state: ReturnType<Store['get']>, id: BodyId, child: BodyId): number {
  const projected = projectPositions(
    ENGINES[state.engineId].positionsAt(state.julianDate),
    state.frameOrigin,
    state.scaleMode,
  );
  const body = projected.get(id)!;
  const moon = projected.get(child)!;
  return Math.hypot(moon.x - body.x, moon.y - body.y);
}

describe('focusViewFor', () => {
  it('frames the Moon when focusing the Earth on the compressed scale', () => {
    const state = stateWith('compressed');
    const zoom = focusViewFor(state, 'earth').zoom;
    // The lunar orbit fills the intended share of the map, which is the whole
    // point of deriving this from the projection rather than from the elements.
    expect(reachOf(state, 'earth', 'moon') * zoom).toBeCloseTo(0.35, 6);
  });

  it('gives the most it is allowed when true scale wants more than the ceiling', () => {
    /*
     * Framing the lunar orbit honestly would take about 2400x and the ceiling is
     * 1000, so the shortcut lands on the ceiling rather than on the ideal. That
     * is the right outcome — it is still the closest look the app permits — but
     * it must land there deliberately, not by some accident of clamping order.
     */
    const state = stateWith('true');
    const zoom = focusViewFor(state, 'earth').zoom;
    expect(zoom).toBe(maxZoomFor('true'));

    // And what that buys is still comfortably visible: a seventh of the
    // half-map, some forty pixels on a 600px field.
    const framed = reachOf(state, 'earth', 'moon') * zoom;
    expect(framed).toBeGreaterThan(0.1);
    expect(framed).toBeLessThan(0.35);
  });

  it('needs far more magnification at true scale than compressed', () => {
    /*
     * The same family, two scales. Compressed the Moon is exaggerated to 0.03 of
     * the map radius; at true scale it is 0.000147. If this ratio ever collapsed
     * to 1 the function would have stopped consulting the projection.
     */
    const compressed = focusViewFor(stateWith('compressed'), 'earth').zoom;
    const trueScale = focusViewFor(stateWith('true'), 'earth').zoom;
    expect(trueScale / compressed).toBeGreaterThan(50);
  });

  it('does not zoom out to fit the planets when focusing the Sun', () => {
    // Every planet names the Sun as parent. Treating them as its satellites
    // would frame Saturn and magnify by less than one — the opposite of what a
    // reader double-clicking the Sun is asking for.
    for (const scaleMode of ['compressed', 'true'] as ScaleMode[]) {
      expect(focusViewFor(stateWith(scaleMode), 'sun').zoom, scaleMode).toBeGreaterThan(1);
    }
  });

  it('frames the Galilean system when focusing Jupiter', () => {
    /*
     * The case this branch adds. Callisto is the outermost of the four, so it is
     * what sets the framing — and because the zoom is read off the projection,
     * the same call serves the exaggerated compressed view and the honest one.
     */
    for (const scaleMode of ['compressed', 'true'] as ScaleMode[]) {
      const state = stateWith(scaleMode);
      const zoom = focusViewFor(state, 'jupiter').zoom;
      expect(reachOf(state, 'jupiter', 'callisto') * zoom, scaleMode).toBeCloseTo(0.35, 6);
      // Every moon of the family lands inside the frame, none of them on the rim.
      for (const moon of ['io', 'europa', 'ganymede', 'callisto'] as BodyId[]) {
        expect(reachOf(state, 'jupiter', moon) * zoom, `${moon}/${scaleMode}`).toBeLessThanOrEqual(
          0.35 + 1e-9,
        );
      }
    }
  });

  it('frames Titan when focusing Saturn', () => {
    const state = stateWith('compressed');
    const zoom = focusViewFor(state, 'saturn').zoom;
    expect(reachOf(state, 'saturn', 'titan') * zoom).toBeCloseTo(0.35, 6);
  });

  it('needs far more magnification for the Galileans at true scale', () => {
    // Honest, they sit hard against Jupiter; exaggerated, they are a system.
    const compressed = focusViewFor(stateWith('compressed'), 'jupiter').zoom;
    const trueScale = focusViewFor(stateWith('true'), 'jupiter').zoom;
    expect(trueScale / compressed).toBeGreaterThan(20);
  });

  it('falls back to a fixed magnification for a body with no moons', () => {
    const state = stateWith('compressed');
    for (const id of ['venus', 'mercury', 'mars'] as BodyId[]) {
      expect(focusViewFor(state, id).zoom, id).toBe(6);
    }
  });

  it('never returns a zoom the store would refuse', () => {
    // Otherwise the shortcut silently lands somewhere other than it computed.
    for (const scaleMode of ['compressed', 'true'] as ScaleMode[]) {
      const state = stateWith(scaleMode);
      for (const id of ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars'] as BodyId[]) {
        const zoom = focusViewFor(state, id).zoom;
        expect(zoom, `${id}/${scaleMode}`).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(zoom, `${id}/${scaleMode}`).toBeLessThanOrEqual(maxZoomFor(scaleMode));
        expect(Number.isFinite(zoom), `${id}/${scaleMode}`).toBe(true);
      }
    }
  });

  it('survives focusing a body that is itself a moon', () => {
    // The Moon has nothing orbiting it, so it takes the fallback rather than
    // dividing by an empty maximum.
    expect(focusViewFor(stateWith('compressed'), 'moon').zoom).toBe(6);
  });

  it('moves the view and leaves the stationary point alone', () => {
    /*
     * The shortcut's contract end to end, and the part that matters most: which
     * body the model is built around is a claim about the *model* — it changes
     * every other body's path — so looking more closely at Mars must not
     * silently rebuild the system around Mars.
     */
    const store = new Store();
    const before = store.get().frameOrigin;
    store.panBy(0.7, -0.4);

    const view = focusViewFor(store.get(), 'mars');
    store.selectBody('mars');
    store.setZoom(view.zoom);
    store.panTo(view.centreOn.x, view.centreOn.y);

    expect(store.get().frameOrigin).toBe(before);
    expect(store.get().selectedBody).toBe('mars');
    expect(store.get().zoom).toBeCloseTo(view.zoom, 12);

    // And Mars is now dead centre: a body renders at (p + pan)·unit.
    expect(store.get().panX + view.centreOn.x).toBeCloseTo(0, 12);
    expect(store.get().panY + view.centreOn.y).toBeCloseTo(0, 12);
  });

  it('centres a body that is nowhere near the frame origin', () => {
    // The pan has to carry the full offset, whatever the previous drag was.
    const store = new Store();
    store.panBy(-3, 5);
    const view = focusViewFor(store.get(), 'saturn');
    store.panTo(view.centreOn.x, view.centreOn.y);

    const onScreen = {
      x: view.centreOn.x + store.get().panX,
      y: view.centreOn.y + store.get().panY,
    };
    expect(Math.hypot(onScreen.x, onScreen.y)).toBeCloseTo(0, 12);
  });

  it('asks for no pan when the body already is the frame origin', () => {
    const store = new Store();
    store.setFrameOrigin('mars');
    const view = focusViewFor(store.get(), 'mars');
    expect(Math.hypot(view.centreOn.x, view.centreOn.y)).toBeCloseTo(0, 12);
  });
});
