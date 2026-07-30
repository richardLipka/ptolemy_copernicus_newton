/**
 * The instrument: map at the centre, celestial ring around it, sight-lines
 * between the two.
 *
 * Every element is built once and then updated by writing CSS custom
 * properties. Nothing re-creates DOM on the animation path, and nothing reads
 * layout back, so the per-frame work is a few dozen property writes and the
 * compositor does the rest.
 */

import { BODY_IDS, type BodyId } from '../../core/bodies';
import { DEG, normalizeDeg } from '../../core/vec';
import { divisionsFor, precessionSinceJ2000 } from '../../core/zodiac';
import { t } from '../../i18n/i18n';
import type { Store } from '../../state/store';
import {
  buildConstruction,
  buildView,
  projectTrail,
  ringIntercept,
  type Point,
} from '../../state/selectors';
import { CONSTELLATION_FIGURES } from './constellations';

/** Radius of the sight-line ring, in map-radius units. Matches theme.css. */
const RING_INNER = 1.06;
const RING_OUTER = 1.26;
const RING_FIGURES = 1.16;

/** Marker diameters in px. Not to scale — Jupiter would swallow Mercury. */
const BODY_SIZE: Record<BodyId, number> = {
  sun: 18,
  mercury: 6,
  venus: 8,
  earth: 9,
  moon: 5,
  mars: 7,
  jupiter: 14,
  saturn: 12,
};

const setPoint = (element: HTMLElement, point: Point): void => {
  element.style.setProperty('--x', String(point.x));
  element.style.setProperty('--y', String(point.y));
};

/** Position a line element as a segment from `from` to `to`. */
function setSegment(element: HTMLElement, from: Point, to: Point): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  setPoint(element, from);
  element.style.setProperty('--len', String(Math.hypot(dx, dy)));
  element.style.setProperty('--angle', String(Math.atan2(dy, dx) / DEG));
}

/** Write a data attribute only if it actually differs. */
function setFlag(element: HTMLElement, name: string, on: boolean): void {
  const value = on ? 'on' : 'off';
  if (element.dataset[name] !== value) element.dataset[name] = value;
}

/** Assign text only if it differs, to avoid needless layout invalidation. */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

const div = (className: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = className;
  return element;
};

export interface OrreryRenderer {
  update(): void;
  rebuildRing(): void;
}

export function createOrrery(container: HTMLElement, store: Store): OrreryRenderer {
  const instrument = div('instrument');
  container.appendChild(instrument);

  // Size the field from the stage in plain pixels. See layout.css for why this
  // is not left to container-query units.
  const fitToContainer = (): void => {
    const { width, height } = container.getBoundingClientRect();
    const field = Math.max(120, Math.min(width, height) * 0.97);
    instrument.style.setProperty('--field', `${field}px`);
  };
  new ResizeObserver(fitToContainer).observe(container);
  fitToContainer();

  const ringLayer = div('ring');
  const figureLayer = div('ring');
  const pathLayer = div('path');
  const harnessLayer = div('harness');
  const sightLayer = div('ring');
  const bodyLayer = div('ring');
  instrument.append(ringLayer, figureLayer, pathLayer, harnessLayer, sightLayer, bodyLayer);
  bodyLayer.style.pointerEvents = 'auto';

  // --- fixed ring furniture ---------------------------------------------

  for (const radius of [RING_INNER, RING_OUTER]) {
    const circle = div('ring__circle');
    circle.style.setProperty('--r', String(radius));
    ringLayer.appendChild(circle);
  }

  // --- star figures (decorative; see constellations.ts) ------------------

  const figureRadius = (latitude: number): number =>
    RING_FIGURES + Math.max(-16, Math.min(16, latitude)) * 0.0022;

  const figurePoint = (lon: number, lat: number): Point => {
    const radius = figureRadius(lat);
    return { x: Math.cos(lon * DEG) * radius, y: Math.sin(lon * DEG) * radius };
  };

  for (const constellation of CONSTELLATION_FIGURES) {
    for (const star of constellation.stars) {
      const element = div('figure__star');
      setPoint(element, figurePoint(star.lon, star.lat));
      element.style.setProperty('--mag', String(Math.max(1.6, 5.2 - star.mag)));
      figureLayer.appendChild(element);
    }
    for (const [a, b] of constellation.lines) {
      const from = constellation.stars[a]!;
      const to = constellation.stars[b]!;
      const element = div('figure__line');
      setSegment(element, figurePoint(from.lon, from.lat), figurePoint(to.lon, to.lat));
      figureLayer.appendChild(element);
    }
  }

  // --- per-body elements -------------------------------------------------

  interface BodyElements {
    marker: HTMLDivElement;
    phase: HTMLDivElement;
    label: HTMLDivElement;
    sightline: HTMLDivElement;
    pip: HTMLDivElement;
    ghost: HTMLDivElement;
    ghostLink: HTMLDivElement;
    /** Live segment joining the logged trail to the body's current position. */
    trailLeader: HTMLDivElement;
  }

  const elements = new Map<BodyId, BodyElements>();

  for (const id of BODY_IDS) {
    const tint = `var(--body-${id})`;

    const marker = div('body');
    marker.style.setProperty('--size', String(BODY_SIZE[id]));
    marker.style.setProperty('--tint', tint);
    marker.dataset.body = id;
    marker.tabIndex = 0;
    marker.setAttribute('role', 'button');

    const phase = div('body__phase');
    // Half in shadow, always: on a plan view exactly one hemisphere faces the
    // Sun. Only the direction changes, so this is set once.
    phase.style.setProperty('--shadow-edge', '0.5');
    marker.appendChild(phase);

    const label = div('body__label');
    const sightline = div('sightline');
    sightline.style.setProperty('--stroke', tint);
    const pip = div('sightline__pip');
    pip.style.setProperty('--stroke', tint);

    const ghost = div('body body--ghost');
    ghost.style.setProperty('--size', String(BODY_SIZE[id]));
    ghost.style.setProperty('--tint', tint);

    const ghostLink = div('ghost-link');
    ghostLink.style.setProperty('--tint', tint);

    const trailLeader = div('trail__segment');
    trailLeader.style.setProperty('--stroke', tint);
    trailLeader.style.setProperty('--age', '1');
    trailLeader.style.display = 'none';
    pathLayer.appendChild(trailLeader);

    sightLayer.append(sightline, pip);
    bodyLayer.append(ghostLink, ghost, marker, label);

    const select = (): void => store.selectBody(id);
    marker.addEventListener('click', select);
    marker.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });

    elements.set(id, {
      marker,
      phase,
      label,
      sightline,
      pip,
      ghost,
      ghostLink,
      trailLeader,
    });
  }

  // --- pooled trail segments --------------------------------------------

  const segmentPool: HTMLDivElement[] = [];

  /** Signature of the last trail draw, so identical frames do no DOM work. */
  let lastTrailKey = '';

  /**
   * The newest logged point per body, in screen units.
   *
   * The log only records every `stepDays`, so its end lags the body by up to a
   * full step — and once history is long the step is coarse enough for the gap
   * to be obvious. A live segment joins this point to the body each frame, so
   * the trail always reaches the planet it belongs to.
   */
  const trailEnds = new Map<BodyId, Point>();

  /**
   * Draw the logged history.
   *
   * Recomputed only when the log has actually changed — a new snapshot, a
   * decimation, or a reprojection after recentring. Between those, which at
   * ordinary rates is most frames, this returns immediately.
   */
  function updateTrails(): void {
    const state = store.get();
    const log = store.trails;

    const key = [
      log.size,
      log.generation,
      state.frameOrigin,
      state.scaleMode,
      state.showOrbits,
    ].join('|');
    if (key === lastTrailKey) return;
    lastTrailKey = key;

    let used = 0;
    trailEnds.clear();

    if (state.showOrbits) {
      const samples = log.all();

      for (const id of BODY_IDS) {
        if (id === state.frameOrigin) continue;
        const points = projectTrail(samples, id, state.frameOrigin, state.scaleMode);
        const newest = points[points.length - 1];
        if (newest) trailEnds.set(id, newest);

        for (let i = 1; i < points.length; i++) {
          const from = points[i - 1]!;
          const to = points[i]!;

          // A body passing close to the frame origin swings through a large
          // apparent angle between two snapshots; skip that rather than draw a
          // chord straight across the map.
          if (Math.hypot(to.x - from.x, to.y - from.y) > 0.6) continue;

          let segment = segmentPool[used];
          if (!segment) {
            segment = div('trail__segment');
            segmentPool.push(segment);
            pathLayer.appendChild(segment);
          }
          segment.style.setProperty('--stroke', `var(--body-${id})`);
          // Older positions fade, so a trail reads as a record with a
          // direction rather than as a drawn curve.
          segment.style.setProperty('--age', (i / points.length).toFixed(3));
          segment.style.display = '';
          setSegment(segment, from, to);
          used++;
        }
      }
    }

    for (let i = used; i < segmentPool.length; i++) {
      segmentPool[i]!.style.display = 'none';
    }
  }

  // --- construction harness ---------------------------------------------

  const harnessSegments: HTMLDivElement[] = [];
  const harnessMarkers: HTMLDivElement[] = [];

  /**
   * Draw the selected body's machinery. Rebuilt every frame from pooled
   * elements, because the epicycle rides round the deferent and the arms turn
   * with it — a static harness would be a diagram, not a mechanism.
   */
  function updateHarness(): void {
    const state = store.get();
    let usedSegments = 0;
    let usedMarkers = 0;

    const takeSegment = (role: string): HTMLDivElement => {
      let element = harnessSegments[usedSegments];
      if (!element) {
        element = div('harness__segment');
        harnessSegments.push(element);
        harnessLayer.appendChild(element);
      }
      element.dataset.role = role;
      element.style.display = '';
      usedSegments++;
      return element;
    };

    const construction =
      state.showConstruction && state.selectedBody
        ? buildConstruction(state, state.selectedBody)
        : null;

    if (construction) {
      for (const circle of construction.circles) {
        for (let i = 1; i < circle.points.length; i++) {
          const from = circle.points[i - 1]!;
          const to = circle.points[i]!;
          // A circle straddling the frame origin projects to a curve that
          // sweeps right across the map; skip the wrap rather than draw a chord.
          if (Math.hypot(to.x - from.x, to.y - from.y) > 0.6) continue;
          setSegment(takeSegment(circle.role), from, to);
        }
      }

      for (const arm of construction.arms) {
        setSegment(takeSegment(arm.role), arm.from, arm.to);
      }

      for (const marker of construction.markers) {
        let element = harnessMarkers[usedMarkers];
        if (!element) {
          element = div('harness__marker');
          harnessMarkers.push(element);
          harnessLayer.appendChild(element);
        }
        element.dataset.role = marker.role;
        element.style.display = '';
        setPoint(element, marker.at);
        usedMarkers++;
      }
    }

    for (let i = usedSegments; i < harnessSegments.length; i++) {
      harnessSegments[i]!.style.display = 'none';
    }
    for (let i = usedMarkers; i < harnessMarkers.length; i++) {
      harnessMarkers[i]!.style.display = 'none';
    }
  }

  // --- zodiac ring divisions --------------------------------------------

  const divisionLayer = div('ring');
  ringLayer.appendChild(divisionLayer);

  function rebuildRing(): void {
    const state = store.get();
    divisionLayer.replaceChildren();

    const divisions = divisionsFor(state.zodiacScheme);
    // Signs are measured from the equinox of date, so the whole band rotates
    // against the fixed J2000 frame the map is drawn in. Over the supported
    // range that is eleven degrees — a third of a sign.
    const offset =
      state.zodiacScheme === 'signs' ? -precessionSinceJ2000(state.julianDate) : 0;

    for (const division of divisions) {
      const start = normalizeDeg(division.start + offset);
      const divider = div('ring__divider');
      divider.style.setProperty('--angle', String(start));
      divisionLayer.appendChild(divider);

      const end = division.end > 360 ? division.end - 360 : division.end;
      const width = normalizeDeg(end - division.start) || 30;

      const label = div('ring__label');
      const mid = normalizeDeg(start + width / 2);
      label.style.setProperty('--angle', String(mid));
      // Counter-rotate so text stays upright, and flip it on the left half so
      // it never reads upside down.
      const flipped = mid > 90 && mid < 270;
      label.style.setProperty('--counter', String(flipped ? 180 : 0));
      if (flipped) label.style.transformOrigin = '100% 50%';
      label.textContent = t(`zodiac.${division.id}`);
      divisionLayer.appendChild(label);
    }

    for (let degree = 0; degree < 360; degree += 5) {
      const tick = div('ring__tick');
      tick.style.setProperty('--angle', String(normalizeDeg(degree + offset)));
      tick.style.setProperty('--len', degree % 30 === 0 ? '0.6' : '0.28');
      divisionLayer.appendChild(tick);
    }
  }

  // --- per-frame update --------------------------------------------------

  function update(): void {
    const state = store.get();
    const view = buildView(state);

    // Only touch these when they change. The stylesheet hangs descendant rules
    // off them, so writing an attribute — even the same value — invalidates
    // style for the whole instrument, and the instrument contains a thousand
    // path segments. Doing it unconditionally cost more than everything else
    // in this function combined.
    setFlag(instrument, 'orbits', state.showOrbits);
    setFlag(instrument, 'sightlines', state.showSightLines);
    setFlag(instrument, 'figures', state.showStarFigures);
    setFlag(instrument, 'construction', state.showConstruction);

    updateTrails();
    updateHarness();

    // Where the Sun is drawn. The map is a plan view, so a body's lit side is
    // simply the half facing the Sun, and the terminator is a straight line
    // through its centre — we are looking down on it edge-on.
    //
    // The *drawn* Sun is used rather than the true direction so the picture is
    // self-consistent: the lit side visibly faces the Sun you can see. Under
    // the compressed scale those differ once the Sun is off-centre, since
    // compressing radii distorts angles measured from anywhere but the frame
    // origin. Phase as an observer would see it is a separate calculation, done
    // from true geometry in the info panel.
    const sunPoint = view.bodies.find((body) => body.id === 'sun')?.point ?? {
      x: 0,
      y: 0,
    };

    for (const body of view.bodies) {
      const parts = elements.get(body.id)!;

      setPoint(parts.marker, body.point);
      setPoint(parts.label, body.point);
      const name = t(`body.${body.id}`);
      setText(parts.label, name);
      if (parts.marker.getAttribute('aria-label') !== name) {
        parts.marker.setAttribute('aria-label', name);
      }
      parts.marker.classList.toggle('body--selected', state.selectedBody === body.id);

      // Every body except the Sun has a lit side, the observer's included —
      // Earth is as much a lit ball as anything else on the map.
      if (body.id === 'sun') {
        parts.phase.style.display = 'none';
      } else {
        parts.phase.style.display = '';
        parts.phase.style.setProperty(
          '--sun-angle',
          String(
            Math.atan2(sunPoint.y - body.point.y, sunPoint.x - body.point.x) / DEG,
          ),
        );
      }

      // Sight-line: drawn at the true apparent longitude, which is what the
      // ring reading has to be correct about. Under compressed scale it will
      // not pass exactly through the marker, because compressing radii about
      // the frame origin distorts angles measured from anywhere else; true
      // scale removes the discrepancy.
      if (body.isObserver) {
        parts.sightline.style.display = 'none';
        parts.pip.style.display = 'none';
      } else {
        parts.sightline.style.display = '';
        parts.pip.style.display = '';
        const target = ringIntercept(body.apparentLongitude, RING_INNER);
        setSegment(parts.sightline, view.observerPoint, target);
        setPoint(parts.pip, target);
      }

        // Close the gap between the newest logged position and where the body
      // actually is now, so the trail meets the planet at any step size.
      const trailEnd = trailEnds.get(body.id);
      const leader = elements.get(body.id)!.trailLeader;
      if (state.showOrbits && trailEnd) {
        const gap = Math.hypot(body.point.x - trailEnd.x, body.point.y - trailEnd.y);
        if (gap > 0.0005 && gap < 0.6) {
          leader.style.display = '';
          setSegment(leader, trailEnd, body.point);
        } else {
          leader.style.display = 'none';
        }
      } else {
        leader.style.display = 'none';
      }

    const ghostPoint = view.ghosts.get(body.id);
      if (ghostPoint) {
        parts.ghost.style.display = '';
        parts.ghostLink.style.display = '';
        setPoint(parts.ghost, ghostPoint);
        setSegment(parts.ghostLink, body.point, ghostPoint);
      } else {
        parts.ghost.style.display = 'none';
        parts.ghostLink.style.display = 'none';
      }
    }
  }

  rebuildRing();
  update();

  return { update, rebuildRing };
}
