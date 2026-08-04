/**
 * The magnification the double-click shortcut lands on.
 *
 * Two things can go wrong and neither shows up as an exception: framing a body
 * that has nothing round it by dividing by zero, and "framing the system" of the
 * Sun — which every planet names as its parent — by zooming *out* until Saturn
 * fits. Both are pinned here.
 */

import { describe, expect, it } from 'vitest';

import { focusZoomFor, projectPositions } from './selectors';
import { ENGINES, MIN_ZOOM, Store, maxZoomFor } from './store';
import type { ScaleMode } from './store';
import type { BodyId } from '../core/bodies';

const stateWith = (scaleMode: ScaleMode) => {
  const store = new Store();
  store.setScaleMode(scaleMode);
  return store.get();
};

/** How far the farthest thing orbiting `id` is drawn, in map-radius units. */
function reachOf(state: ReturnType<Store['get']>, id: BodyId, child: BodyId): number {
  const projected = projectPositions(
    ENGINES[state.engineId].positionsAt(state.julianDate),
    id,
    state.scaleMode,
  );
  const point = projected.get(child)!;
  return Math.hypot(point.x, point.y);
}

describe('focusZoomFor', () => {
  it('frames the Moon when focusing the Earth on the compressed scale', () => {
    const state = stateWith('compressed');
    const zoom = focusZoomFor(state, 'earth');
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
    const zoom = focusZoomFor(state, 'earth');
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
    const compressed = focusZoomFor(stateWith('compressed'), 'earth');
    const trueScale = focusZoomFor(stateWith('true'), 'earth');
    expect(trueScale / compressed).toBeGreaterThan(50);
  });

  it('does not zoom out to fit the planets when focusing the Sun', () => {
    // Every planet names the Sun as parent. Treating them as its satellites
    // would frame Saturn and magnify by less than one — the opposite of what a
    // reader double-clicking the Sun is asking for.
    for (const scaleMode of ['compressed', 'true'] as ScaleMode[]) {
      expect(focusZoomFor(stateWith(scaleMode), 'sun'), scaleMode).toBeGreaterThan(1);
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
      const zoom = focusZoomFor(state, 'jupiter');
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
    const zoom = focusZoomFor(state, 'saturn');
    expect(reachOf(state, 'saturn', 'titan') * zoom).toBeCloseTo(0.35, 6);
  });

  it('needs far more magnification for the Galileans at true scale', () => {
    // Honest, they sit hard against Jupiter; exaggerated, they are a system.
    const compressed = focusZoomFor(stateWith('compressed'), 'jupiter');
    const trueScale = focusZoomFor(stateWith('true'), 'jupiter');
    expect(trueScale / compressed).toBeGreaterThan(20);
  });

  it('falls back to a fixed magnification for a body with no moons', () => {
    const state = stateWith('compressed');
    for (const id of ['venus', 'mercury', 'mars'] as BodyId[]) {
      expect(focusZoomFor(state, id), id).toBe(6);
    }
  });

  it('never returns a zoom the store would refuse', () => {
    // Otherwise the shortcut silently lands somewhere other than it computed.
    for (const scaleMode of ['compressed', 'true'] as ScaleMode[]) {
      const state = stateWith(scaleMode);
      for (const id of ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars'] as BodyId[]) {
        const zoom = focusZoomFor(state, id);
        expect(zoom, `${id}/${scaleMode}`).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(zoom, `${id}/${scaleMode}`).toBeLessThanOrEqual(maxZoomFor(scaleMode));
        expect(Number.isFinite(zoom), `${id}/${scaleMode}`).toBe(true);
      }
    }
  });

  it('survives focusing a body that is itself a moon', () => {
    // The Moon has nothing orbiting it, so it takes the fallback rather than
    // dividing by an empty maximum.
    expect(focusZoomFor(stateWith('compressed'), 'moon')).toBe(6);
  });

  it('lands where the store actually puts it, pan cleared', () => {
    /*
     * The shortcut's contract end to end: centred on the body, drag cleared so
     * the magnification is about the body itself, and the zoom accepted.
     */
    const store = new Store();
    store.panBy(0.7, -0.4);
    const wanted = focusZoomFor(store.get(), 'earth');

    store.selectBody('earth');
    store.setFrameOrigin('earth');
    store.setZoom(wanted);

    expect(store.get().frameOrigin).toBe('earth');
    expect(store.get().selectedBody).toBe('earth');
    expect(store.get().panX).toBe(0);
    expect(store.get().panY).toBe(0);
    expect(store.get().zoom).toBeCloseTo(wanted, 12);
  });
});
