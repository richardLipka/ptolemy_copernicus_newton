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
import { formatNumber, t } from '../../i18n/i18n';
import type { Store } from '../../state/store';
import {
  buildConstruction,
  buildDynamicsView,
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

/** Headroom for a concentric ring and its labels. Matches layout.css. */
const BASE_RING_EXTENT = 1.46;

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
  /** Pixels per map-radius unit, for translating a drag into map coordinates. */
  unitPx(): number;
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
    /** Observer to body. */
    sightline: HTMLDivElement;
    /** Body onward to the zodiac ring. */
    sightlineOuter: HTMLDivElement;
    pip: HTMLDivElement;
    reading: HTMLDivElement;
    ghosts: { body: HTMLDivElement; link: HTMLDivElement }[];
    takeGhost: (index: number) => { body: HTMLDivElement; link: HTMLDivElement };
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
    // Observer to body: solid, since it is a real line of sight.
    const sightline = div('sightline sightline--inner');
    sightline.style.setProperty('--stroke', tint);
    // Body to the zodiac: the same ray continued out to the sphere.
    const sightlineOuter = div('sightline sightline--outer');
    sightlineOuter.style.setProperty('--stroke', tint);
    const pip = div('sightline__pip');
    pip.style.setProperty('--stroke', tint);

    // The exact zodiac reading, drawn at the pip for the selected body only.
    // One label is informative; nine would be a wall of text around the ring.
    const reading = div('sightline__reading');
    reading.style.display = 'none';

    /**
     * Ghosts are pooled per body: one for a single comparison model, up to three
     * for compare-all. Grown on demand rather than pre-allocated, since most
     * sessions never turn the overlay on at all.
     */
    const ghosts: { body: HTMLDivElement; link: HTMLDivElement }[] = [];
    const takeGhost = (index: number) => {
      let pair = ghosts[index];
      if (!pair) {
        const ghostBody = div('body body--ghost');
        ghostBody.style.setProperty('--size', String(BODY_SIZE[id]));
        ghostBody.style.setProperty('--tint', tint);
        const link = div('ghost-link');
        link.style.setProperty('--tint', tint);
        bodyLayer.append(link, ghostBody);
        pair = { body: ghostBody, link };
        ghosts.push(pair);
      }
      return pair;
    };

    const trailLeader = div('trail__segment');
    trailLeader.style.setProperty('--stroke', tint);
    trailLeader.style.setProperty('--age', '1');
    trailLeader.style.display = 'none';
    pathLayer.appendChild(trailLeader);

    sightLayer.append(sightline, sightlineOuter, pip, reading);
    bodyLayer.append(marker, label);

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
      sightlineOuter,
      pip,
      reading,
      ghosts,
      takeGhost,
      trailLeader,
    });
  }

  // --- pooled trail segments --------------------------------------------

  const segmentPool: HTMLDivElement[] = [];

  /** Signature of the last trail draw, so identical frames do no DOM work. */
  let lastTrailKey = '';

  /** Last magnification written to the DOM. */
  let lastZoom = Number.NaN;
  let lastPanX = Number.NaN;
  let lastPanY = Number.NaN;

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
  const vectorShafts: HTMLDivElement[] = [];
  const vectorHeads: HTMLDivElement[] = [];

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
      for (const curve of construction.curves) {
        for (let i = 1; i < curve.points.length; i++) {
          const from = curve.points[i - 1]!;
          const to = curve.points[i]!;
          // A curve straddling the frame origin projects to one that sweeps
          // right across the map; skip the wrap rather than draw a chord.
          if (Math.hypot(to.x - from.x, to.y - from.y) > 0.6) continue;
          setSegment(takeSegment(curve.role), from, to);
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

    // Newton's machinery is vectors rather than circles, drawn in the same layer
    // under the same switch: force is how this model places a body.
    const vectors =
      state.showConstruction && state.selectedBody
        ? buildDynamicsView(state, state.selectedBody)
        : null;

    let usedVectors = 0;
    if (vectors) {
      for (const vector of vectors) {
        let shaft = vectorShafts[usedVectors];
        let head = vectorHeads[usedVectors];
        if (!shaft || !head) {
          shaft = div('vector__shaft');
          head = div('vector__head');
          vectorShafts.push(shaft);
          vectorHeads.push(head);
          harnessLayer.append(shaft, head);
        }

        for (const element of [shaft, head]) {
          element.dataset.role = vector.role;
          if (vector.source) element.dataset.source = vector.source;
          else delete element.dataset.source;
          element.style.display = '';
        }

        setSegment(shaft, vector.from, vector.to);
        // The head sits at the tip, turned to face along the shaft.
        setPoint(head, vector.to);
        head.style.setProperty(
          '--angle',
          String(
            Math.atan2(vector.to.y - vector.from.y, vector.to.x - vector.from.x) / DEG,
          ),
        );
        usedVectors++;
      }
    }

    for (let i = usedVectors; i < vectorShafts.length; i++) {
      vectorShafts[i]!.style.display = 'none';
      vectorHeads[i]!.style.display = 'none';
    }
  }

  // --- zodiac ring divisions --------------------------------------------

  const divisionLayer = div('ring');
  ringLayer.appendChild(divisionLayer);

  /** Sign labels, kept so one can be lit per frame without a DOM query. */
  const divisionLabels: HTMLDivElement[] = [];

  function rebuildRing(): void {
    const state = store.get();
    divisionLayer.replaceChildren();
    divisionLabels.length = 0;

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
      label.dataset.division = division.id;
      divisionLabels.push(label);
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

    /*
     * Where the celestial sphere sits.
     *
     * Centring it on the observer is a pure translation of the ring already
     * built: its divisions are absolute ecliptic longitudes either way, so only
     * the point they are measured from moves. Nothing needs rebuilding, which is
     * what makes this cheap enough to do every frame as the observer orbits.
     *
     * With the sphere around the observer, a sight-line becomes a single straight
     * ray at the true apparent longitude — no parallax between "direction λ from
     * here" and "the point at angle λ on the ring", because the ring is now
     * centred on here.
     */
    const observerCentred = state.sphereCentre === 'observer';
    const sphere = observerCentred ? view.observerPoint : { x: 0, y: 0 };

    /*
     * Grow the ring until it encloses every body, as seen from wherever it is
     * centred.
     *
     * Concentric, the bodies live inside 1.0 and the ring at 1.06 clears them
     * by construction. Centred on the observer it does not: the observer is
     * itself offset — Earth sits 0.36 out at compressed scale — so a body on
     * the far side can be 1.36 away while the ring stays at 1.06. Saturn was
     * being drawn *outside its own sphere of fixed stars*, and its sight-line
     * had to double back 166° to reach the ring.
     *
     * That was always true; it only became visible once both segments were
     * drawn in this mode. Scaling the ring layer fixes the geometry rather than
     * the symptom. Quantised so the instrument does not breathe as the observer
     * moves, and pinned to 1 when concentric so the default view is untouched.
     */
    let ringScale = 1;
    if (observerCentred) {
      let furthest = 0;
      for (const body of view.bodies) {
        furthest = Math.max(
          furthest,
          Math.hypot(body.point.x - sphere.x, body.point.y - sphere.y),
        );
      }
      const wanted = (furthest + 0.06) / RING_INNER;
      if (wanted > 1) ringScale = Math.ceil(wanted / 0.05) * 0.05;
    }
    const ringInner = RING_INNER * ringScale;

    // Zoom out enough that an off-centre ring is not clipped, quantised so the
    // instrument does not breathe as the observer's distance varies. The
    // concentric case keeps the stylesheet's own value exactly, so the default
    // view is unaffected by this feature existing.
    if (observerCentred) {
      // Quantise only the *extra* beyond the concentric extent, so an observer
      // that happens to sit at the centre — Ptolemy's Earth — costs nothing and
      // the view matches the frame-centred one exactly.
      const offset = Math.hypot(sphere.x, sphere.y);
      const extra = Math.max(0, offset + RING_OUTER * ringScale + 0.2 - BASE_RING_EXTENT);
      const needed = BASE_RING_EXTENT + Math.ceil(extra / 0.05) * 0.05;
      instrument.style.setProperty('--ring-extent', needed.toFixed(3));
    } else {
      instrument.style.removeProperty('--ring-extent');
    }

    // The scale rides on the same transform, so circles, dividers, ticks,
    // labels and the star figures all grow together and stay registered.
    const sphereShift =
      `translate(calc(${sphere.x} * var(--unit)), calc(${sphere.y} * var(--unit)))` +
      (ringScale === 1 ? '' : ` scale(${ringScale})`);
    ringLayer.style.transform = sphereShift;
    figureLayer.style.transform = sphereShift;

    // Writing --unit's multiplier invalidates every descendant's transform, so
    // it is set only when it actually changes rather than every frame.
    /*
     * Panning translates the whole instrument rather than every element in it.
     * One transform on one node costs nothing and, being a transform, changes no
     * layout — so the ResizeObserver that sizes the field is untouched and the
     * body markers' hit boxes travel with their drawings.
     */
    if (state.panX !== lastPanX || state.panY !== lastPanY) {
      lastPanX = state.panX;
      lastPanY = state.panY;
      instrument.style.setProperty('--pan-x', String(state.panX));
      instrument.style.setProperty('--pan-y', String(state.panY));
    }

    if (state.zoom !== lastZoom) {
      lastZoom = state.zoom;
      instrument.style.setProperty('--zoom', String(state.zoom));
    }

    // Only touch these when they change. The stylesheet hangs descendant rules
    // off them, so writing an attribute — even the same value — invalidates
    // style for the whole instrument, and the instrument contains a thousand
    // path segments. Doing it unconditionally cost more than everything else
    // in this function combined.
    setFlag(instrument, 'orbits', state.showOrbits);
    setFlag(instrument, 'sightlines', state.showSightLines);
    // Lets the CSS drop every *other* sight-line back without touching them.
    setFlag(instrument, 'hasselection', Boolean(state.selectedBody));

    /*
     * Light the sign the selected body appears in.
     *
     * The pip marks the exact longitude; this says which of the twelve it falls
     * in, which is the reading a pre-telescopic astronomer would actually have
     * recorded. Cheap enough for the animation path: thirteen labels at most,
     * and only the two that change are written to.
     */
    const activeDivision = state.selectedBody
      ? view.bodies.find((candidate) => candidate.id === state.selectedBody)?.zodiac
          .division.id
      : undefined;
    for (const label of divisionLabels) {
      const active = label.dataset.division === activeDivision;
      if ((label.dataset.active === 'on') !== active) {
        label.dataset.active = active ? 'on' : 'off';
      }
    }
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

      // Sight-line, in two segments that mean different things: from the
      // observer to the body, then from the body out to where it appears on the
      // zodiac. Drawn as one straight line it could only satisfy one of those
      // and it used to satisfy neither exactly.
      //
      // The reason is that two independent distortions sit between them. The
      // ring's divisions are absolute ecliptic longitudes measured from the
      // centre of the instrument, but a sight-line starts at the observer — so
      // whenever the observer is not the frame origin there is a parallax
      // between "direction λ from the observer" and "the point at angle λ on the
      // ring". On top of that, the compressed scale distorts angles measured
      // from anywhere but the frame origin.
      //
      // Both vanish in Ptolemy's geocentric view, where observer and centre
      // coincide, which is exactly why the lines are dead straight there. The
      // kink elsewhere is the size of the distortion, and shrinks to almost
      // nothing at true scale.
      /*
       * Emphasis for the selected body.
       *
       * With nine sight-lines and nine pips on the ring, the one you actually
       * asked about was no more visible than the rest. The classes below raise
       * it and the CSS drops everything else back, so "where does Mars appear"
       * has a single unambiguous answer on the map.
       */
      const isSelected = state.selectedBody === body.id;
      parts.sightline.classList.toggle('sightline--selected', isSelected);
      parts.sightlineOuter.classList.toggle('sightline--selected', isSelected);
      parts.pip.classList.toggle('sightline__pip--selected', isSelected);

      if (body.isObserver) {
        parts.sightline.style.display = 'none';
        parts.sightlineOuter.style.display = 'none';
        parts.pip.style.display = 'none';
        parts.reading.style.display = 'none';
      } else {
        // The ring intercept is measured from whatever the sphere is centred on.
        const ray = ringIntercept(body.apparentLongitude, ringInner);
        const target = { x: sphere.x + ray.x, y: sphere.y + ray.y };

        parts.sightline.style.display = '';
        parts.pip.style.display = '';
        setPoint(parts.pip, target);

        /*
         * Always two segments: observer → body → sphere.
         *
         * The observer-centred sphere used to be drawn instead as a single
         * straight ray from the observer to the ring, on the grounds that it is
         * geometrically the true direction. It is — but under the compressed
         * scale that ray does not pass through the body's marker, so the picture
         * asserted that a planet appears *there* while drawing the planet
         * somewhere else. A line that misses the thing it is pointing at is
         * worse than a bent one.
         *
         * So the kink stays wherever the projection puts one. It is not an
         * artefact to be hidden: its size *is* the distortion the compressed
         * scale introduces, and it shrinks to nothing at true scale and in
         * Ptolemy's view, where observer and centre coincide.
         */
        parts.sightlineOuter.style.display = '';
        setSegment(parts.sightline, view.observerPoint, body.point);
        setSegment(parts.sightlineOuter, body.point, target);

        if (isSelected) {
          parts.reading.style.display = '';
          setPoint(parts.reading, target);

          // Nudge the badge *inward*, toward the middle of the instrument. A
          // fixed upward offset put it outside the ring — and possibly off the
          // element — whenever the body appeared near the top of the sky.
          const inwardX = sphere.x - target.x;
          const inwardY = sphere.y - target.y;
          const reach = Math.hypot(inwardX, inwardY) || 1;
          parts.reading.style.setProperty('--nx', (inwardX / reach).toFixed(4));
          parts.reading.style.setProperty('--ny', (inwardY / reach).toFixed(4));
          setText(
            parts.reading,
            `${formatNumber(body.zodiac.degreesInto, 1)}° ${t(`zodiac.${body.zodiac.division.id}`)}`,
          );
        } else {
          parts.reading.style.display = 'none';
        }
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

      // One ghost per comparison model. Each is tinted by *model* rather than by
      // body, because with three on the map at once the question stops being
      // "which planet is that" — the link line already answers it — and becomes
      // "which model put it there".
      let used = 0;
      for (const layer of view.ghosts) {
        const point = layer.points.get(body.id);
        if (!point) continue;

        const pair = parts.takeGhost(used++);
        pair.body.style.display = '';
        pair.link.style.display = '';
        pair.body.dataset.engine = layer.engineId;
        pair.link.dataset.engine = layer.engineId;
        setPoint(pair.body, point);
        setSegment(pair.link, body.point, point);
      }

      for (let i = used; i < parts.ghosts.length; i++) {
        parts.ghosts[i]!.body.style.display = 'none';
        parts.ghosts[i]!.link.style.display = 'none';
      }
    }
  }

  rebuildRing();
  update();

  /*
   * --unit is `width / 2 * zoom`, so it can be recovered from the laid-out
   * element without parsing a calc() out of the computed style.
   */
  const unitPx = (): number =>
    (instrument.clientWidth / 2) * store.get().zoom;

  return { update, rebuildRing, unitPx };
}
