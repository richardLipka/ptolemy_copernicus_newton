/**
 * The map, redrawn as real SVG shapes.
 *
 * Not a snapshot of the live instrument — see `svgDocument.ts` for why a DOM
 * clone cannot produce a PNG — but not a second guess at the geometry either.
 * Every position here comes from the same pure functions `orrery.ts` itself
 * calls: `buildView`, `buildConstruction`, `buildDynamicsView`, `projectTrail`,
 * `divisionsFor`, `CONSTELLATION_FIGURES`. What differs is only the last
 * step — a `<circle>` and a `<line>` here where the live renderer would write
 * `--x`/`--y` onto a positioned div — so the two cannot show two different
 * pictures of where anything actually is.
 *
 * The projection is copied from `createOrrery`'s own arithmetic
 * (`fieldPx / ringExtent / 2 * zoom`), because that arithmetic is not exposed
 * anywhere a caller could just ask for it. It is exercised in
 * `mapSvg.test.ts` against figures read back from the running app, so a
 * future change to one and not the other has a test to catch it.
 *
 * Left out, deliberately: the ghost-overlay comparison (a second, fainter
 * model drawn over this one) and the edge-of-map pointers for a body that has
 * scrolled out of view. Both are real features of the live map; neither is
 * "the model in its current configuration", which is what this exists to
 * hand someone, and both would have added real complexity for a case the
 * export's own viewBox already handles honestly — a body past the edge is
 * simply outside the picture, which is what "off the map" means.
 */

import { BODIES, BODY_IDS, type BodyId } from '@orrery/core/bodies';
import { DEG, normalizeDeg } from '@orrery/core/vec';
import { divisionsFor, precessionSinceJ2000 } from '@orrery/core/zodiac';
import { bodyName, formatNumber, t } from '../../i18n/i18n';
import {
  buildConstruction,
  buildDynamicsView,
  buildView,
  projectRadius,
  projectTrail,
  ringIntercept,
  type OrreryView,
  type Point,
  type ProjectedVector,
} from '../../state/selectors';
import { CONSTELLATION_FIGURES } from '../orrery/constellations';
import { labelHasRoom } from '../orrery/orrery';
import { chooseScaleBar } from '../orrery/scalebar';
import type { State } from '../../state/store';
import type { TrailSample } from '../../state/trails';
import { escapeXml, resolveThemeColor, svgDocument } from './svgDocument';

/** Matches `RING_INNER`/`RING_OUTER`/`RING_FIGURES` in `orrery/orrery.ts` and `--ring-*` in tokens.css. */
const RING_INNER = 1.06;
const RING_OUTER = 1.26;
const RING_FIGURES = 1.16;
/** Matches `BASE_RING_EXTENT` in `orrery/orrery.ts` and `--ring-extent` in layout.css. */
const BASE_RING_EXTENT = 1.46;

/** Matches `BODY_SIZE` in `orrery/orrery.ts`. Not to scale — Jupiter would swallow Mercury. */
const BODY_SIZE: Record<BodyId, number> = {
  sun: 18,
  mercury: 6,
  venus: 8,
  earth: 9,
  moon: 5,
  mars: 7,
  jupiter: 14,
  saturn: 12,
  io: 4,
  europa: 4,
  ganymede: 5,
  callisto: 4,
  titan: 5,
};

/** Screen-space coordinates in px, already including pan and zoom. */
interface Projector {
  (point: Point): { x: number; y: number };
  /** Pixels per map-radius unit — for a radius or a stroke width, not a point. */
  unitPx: number;
}

interface Palette {
  surface: string;
  brassDark: string;
  brass: string;
  brassBright: string;
  inkSoft: string;
  inkFaint: string;
  textStrong: string;
  parchment: string;
  accentDark: string;
  shadowFill: string;
  velocityTint: string;
  netForceTint: string;
  body: (id: BodyId) => string;
}

function readPalette(): Palette {
  return {
    surface: resolveThemeColor('--surface'),
    brassDark: resolveThemeColor('--brass-dark'),
    brass: resolveThemeColor('--brass'),
    brassBright: resolveThemeColor('--brass-bright'),
    inkSoft: resolveThemeColor('--ink-soft'),
    inkFaint: resolveThemeColor('--ink-faint'),
    textStrong: resolveThemeColor('--text-strong'),
    parchment: resolveThemeColor('--parchment'),
    accentDark: resolveThemeColor('--accent-dark'),
    shadowFill: resolveThemeColor('--shadow-fill'),
    velocityTint: resolveThemeColor('--velocity-tint'),
    netForceTint: resolveThemeColor('--net-force-tint'),
    body: (id) => resolveThemeColor(`--body-${id}`),
  };
}

const num = (value: number, digits = 2): string => value.toFixed(digits);

function lineTag(
  from: { x: number; y: number },
  to: { x: number; y: number },
  stroke: string,
  width: number,
  opacity = 1,
  dasharray?: string,
): string {
  return (
    `<line x1="${num(from.x)}" y1="${num(from.y)}" x2="${num(to.x)}" y2="${num(to.y)}" ` +
    `stroke="${stroke}" stroke-width="${num(width, 2)}" opacity="${num(opacity)}"` +
    (dasharray ? ` stroke-dasharray="${dasharray}"` : '') +
    ` stroke-linecap="round"/>`
  );
}

function circleTag(
  centre: { x: number; y: number },
  radius: number,
  fill: string,
  stroke?: string,
  strokeWidth = 1,
  opacity = 1,
): string {
  return (
    `<circle cx="${num(centre.x)}" cy="${num(centre.y)}" r="${num(Math.max(0, radius))}" fill="${fill}"` +
    (stroke ? ` stroke="${stroke}" stroke-width="${num(strokeWidth, 2)}"` : '') +
    ` opacity="${num(opacity)}"/>`
  );
}

function polylineTag(points: { x: number; y: number }[], stroke: string, width: number, opacity = 1): string {
  if (points.length < 2) return '';
  const path = points.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');
  return `<polyline points="${path}" fill="none" stroke="${stroke}" stroke-width="${num(width, 2)}" opacity="${num(opacity)}" stroke-linejoin="round"/>`;
}

function textTag(
  at: { x: number; y: number },
  content: string,
  fill: string,
  size: number,
  options: { anchor?: 'start' | 'middle' | 'end'; transform?: string; weight?: number } = {},
): string {
  return (
    `<text x="${num(at.x)}" y="${num(at.y)}" fill="${fill}" font-size="${num(size, 1)}" ` +
    `text-anchor="${options.anchor ?? 'middle'}"` +
    (options.weight ? ` font-weight="${options.weight}"` : '') +
    (options.transform ? ` transform="${options.transform}"` : '') +
    `>${escapeXml(content)}</text>`
  );
}

/** A half-disc, in shadow, rotated to face away from the Sun. Mirrors `.body__phase`. */
function phaseWedge(
  centre: { x: number; y: number },
  radius: number,
  sunAngleDeg: number,
  fill: string,
): string {
  const a = sunAngleDeg * DEG;
  const dx = Math.sin(a) * radius;
  const dy = -Math.cos(a) * radius;
  const p1 = { x: centre.x - dx, y: centre.y - dy };
  const p2 = { x: centre.x + dx, y: centre.y + dy };
  return (
    `<path d="M${num(p1.x)},${num(p1.y)} A${num(radius)},${num(radius)} 0 0 1 ${num(p2.x)},${num(p2.y)} Z" ` +
    `fill="${fill}"/>`
  );
}

/** A small diamond — the equant marker. */
function diamondTag(centre: { x: number; y: number }, half: number, fill: string, stroke: string): string {
  const points = [
    { x: centre.x, y: centre.y - half },
    { x: centre.x + half, y: centre.y },
    { x: centre.x, y: centre.y + half },
    { x: centre.x - half, y: centre.y },
  ]
    .map((p) => `${num(p.x)},${num(p.y)}`)
    .join(' ');
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
}

function arrowHead(tip: { x: number; y: number }, angleDeg: number, length: number, half: number, fill: string): string {
  const a = angleDeg * DEG;
  const back = { x: tip.x - Math.cos(a) * length, y: tip.y - Math.sin(a) * length };
  const perpX = -Math.sin(a) * half;
  const perpY = Math.cos(a) * half;
  const p1 = { x: back.x + perpX, y: back.y + perpY };
  const p2 = { x: back.x - perpX, y: back.y - perpY };
  return `<polygon points="${num(tip.x)},${num(tip.y)} ${num(p1.x)},${num(p1.y)} ${num(p2.x)},${num(p2.y)}" fill="${fill}"/>`;
}

/**
 * How wide the ring/star-figure layer's own transform makes things, on top of
 * the ordinary projection — see the file-level note. 1 and the frame origin in
 * the concentric case, so the two layers coincide exactly when the sphere is
 * not observer-centred, which is the common case and the one this collapses
 * back to.
 */
export function ringGeometry(
  state: State,
  view: OrreryView,
): { sphere: Point; scale: number; extent: number } {
  if (state.sphereCentre !== 'observer') {
    return { sphere: { x: 0, y: 0 }, scale: 1, extent: BASE_RING_EXTENT };
  }

  const sphere = view.observerPoint;
  let furthest = 0;
  for (const body of view.bodies) {
    furthest = Math.max(furthest, Math.hypot(body.point.x - sphere.x, body.point.y - sphere.y));
  }
  const wanted = (furthest + 0.06) / RING_INNER;
  const scale = wanted > 1 ? Math.ceil(wanted / 0.05) * 0.05 : 1;

  const offset = Math.hypot(sphere.x, sphere.y);
  const extra = Math.max(0, offset + RING_OUTER * scale + 0.2 - BASE_RING_EXTENT);
  const extent = BASE_RING_EXTENT + Math.ceil(extra / 0.05) * 0.05;

  return { sphere, scale, extent };
}

/**
 * Pixels per map-radius unit, and where map-radius (0, 0) lands on the
 * canvas — the same two numbers `createOrrery`'s own `fitToContainer` and
 * `update` derive, by the same arithmetic (`field / ringExtent / 2 * zoom`),
 * so an export lines up with the live map at the same width, zoom and pan.
 * Pulled out on its own because it needs no theme, no palette and no DOM, and
 * is exactly the part worth pinning against figures read back from the
 * running app — see `mapSvg.test.ts`.
 */
export function mapProjection(
  width: number,
  height: number,
  ringExtent: number,
  zoom: number,
  panX: number,
  panY: number,
): { unitPx: number; centre: { x: number; y: number } } {
  const field = Math.max(120, Math.min(width, height) * 0.97);
  const unitPx = (field / ringExtent / 2) * zoom;
  return { unitPx, centre: { x: width / 2 + panX * unitPx, y: height / 2 + panY * unitPx } };
}

export interface MapSvgOptions {
  width: number;
  height: number;
  state: State;
  trails: readonly TrailSample[];
}

export function buildMapSvg({ width, height, state, trails }: MapSvgOptions): string {
  const palette = readPalette();
  const view = buildView(state);
  const { sphere, scale: ringScale, extent: ringExtent } = ringGeometry(state, view);

  const { unitPx, centre } = mapProjection(
    width,
    height,
    ringExtent,
    state.zoom,
    state.panX,
    state.panY,
  );
  const project: Projector = Object.assign(
    (p: Point) => ({ x: centre.x + p.x * unitPx, y: centre.y + p.y * unitPx }),
    { unitPx },
  );

  const ringUnitPx = unitPx * ringScale;
  const ringOrigin = { x: centre.x + sphere.x * unitPx, y: centre.y + sphere.y * unitPx };
  const ringProject: Projector = Object.assign(
    (p: Point) => ({ x: ringOrigin.x + p.x * ringUnitPx, y: ringOrigin.y + p.y * ringUnitPx }),
    { unitPx: ringUnitPx },
  );

  const parts: string[] = [];

  // --- the ring and its divisions ---------------------------------------

  const ringInner = RING_INNER;
  for (const r of [ringInner, RING_OUTER]) {
    parts.push(circleTag(ringOrigin, r * ringUnitPx, 'none', palette.brassDark, 1, 0.75));
  }

  const divisions = divisionsFor(state.zodiacScheme);
  const precessionOffset =
    state.zodiacScheme === 'signs' ? -precessionSinceJ2000(state.julianDate) : 0;

  const atRing = (angleDeg: number, radiusUnits: number): { x: number; y: number } => {
    const a = angleDeg * DEG;
    return ringProject({ x: Math.cos(a) * radiusUnits, y: Math.sin(a) * radiusUnits });
  };

  for (const division of divisions) {
    const start = normalizeDeg(division.start + precessionOffset);
    parts.push(
      lineTag(
        atRing(start, ringInner),
        atRing(start, RING_OUTER),
        palette.brassDark,
        1,
        0.8,
      ),
    );

    const end = division.end > 360 ? division.end - 360 : division.end;
    const width_ = normalizeDeg(end - division.start) || 30;
    const mid = normalizeDeg(start + width_ / 2);
    const labelAt = atRing(mid, ringInner + 0.06);
    const flipped = mid > 90 && mid < 270;
    const rotateDeg = flipped ? mid + 180 : mid;
    parts.push(
      textTag(labelAt, t(`zodiac.${division.id}`), palette.inkSoft, 11, {
        transform: `rotate(${num(rotateDeg, 1)} ${num(labelAt.x)} ${num(labelAt.y)})`,
      }),
    );
  }

  for (let degree = 0; degree < 360; degree += 5) {
    const angle = normalizeDeg(degree + precessionOffset);
    const tickLen = degree % 30 === 0 ? 0.6 : 0.28;
    parts.push(
      lineTag(
        atRing(angle, ringInner),
        atRing(angle, ringInner + (RING_OUTER - ringInner) * tickLen),
        palette.inkFaint,
        0.5,
        0.6,
      ),
    );
  }

  // --- star figures --------------------------------------------------------

  if (state.showStarFigures) {
    const figureRadius = (latitude: number): number =>
      RING_FIGURES + Math.max(-16, Math.min(16, latitude)) * 0.0022;
    const figurePoint = (lon: number, lat: number): Point => {
      const r = figureRadius(lat);
      return { x: Math.cos(lon * DEG) * r, y: Math.sin(lon * DEG) * r };
    };

    for (const constellation of CONSTELLATION_FIGURES) {
      for (const [a, b] of constellation.lines) {
        const from = constellation.stars[a]!;
        const to = constellation.stars[b]!;
        parts.push(
          lineTag(
            ringProject(figurePoint(from.lon, from.lat)),
            ringProject(figurePoint(to.lon, to.lat)),
            palette.inkFaint,
            0.5,
            0.5,
          ),
        );
      }
      for (const star of constellation.stars) {
        const at = ringProject(figurePoint(star.lon, star.lat));
        parts.push(circleTag(at, Math.max(0.6, 5.2 - star.mag) * 0.35, palette.inkSoft, undefined, 0, 0.7));
      }
    }
  }

  // --- orbit trails ----------------------------------------------------

  if (state.showOrbits) {
    for (const id of BODY_IDS) {
      if (id === state.frameOrigin) continue;
      const points = projectTrail(trails, id, state.frameOrigin, state.scaleMode);
      const tint = palette.body(id);

      let run: { x: number; y: number }[] = [];
      const flush = (endIndex: number): void => {
        if (run.length < 2) {
          run = [];
          return;
        }
        // One fading colour per short run is close enough for a still image;
        // the live map fades every individual hop, which a static picture has
        // no motion to justify paying for.
        const age = endIndex / points.length;
        parts.push(polylineTag(run, tint, 1, 0.25 + age * 0.55));
        run = [];
      };

      for (let i = 0; i < points.length; i++) {
        const point = points[i]!;
        if (i > 0) {
          const previous = points[i - 1]!;
          if (Math.hypot(point.x - previous.x, point.y - previous.y) > 0.6) {
            flush(i - 1);
          }
        }
        run.push(project(point));
      }
      flush(points.length - 1);
    }
  }

  // --- sight-lines -------------------------------------------------------

  if (state.showSightLines) {
    const observerCentred = state.sphereCentre === 'observer';
    const sphereForIntercept = observerCentred ? view.observerPoint : { x: 0, y: 0 };

    for (const body of view.bodies) {
      if (body.isObserver) continue;
      const satellite = Boolean(BODIES[body.id].satellite);
      const isSelected = state.selectedBody === body.id;
      if (satellite && !isSelected) continue;

      const ray = ringIntercept(body.apparentLongitude, ringInner);
      const target = { x: sphereForIntercept.x + ray.x, y: sphereForIntercept.y + ray.y };
      const tint = palette.body(body.id);
      const emphasis = state.selectedBody ? (isSelected ? 1 : 0.35) : 1;

      parts.push(
        lineTag(project(view.observerPoint), project(body.point), tint, isSelected ? 1 : 0.5, 0.65 * emphasis),
      );
      parts.push(
        lineTag(project(body.point), project(target), tint, isSelected ? 1 : 0.5, 0.5 * emphasis),
      );
      parts.push(
        circleTag(project(target), isSelected ? 4 : 2.5, palette.parchment, tint, isSelected ? 1.5 : 1, emphasis),
      );
    }
  }

  // --- construction harness, or Newton's vectors --------------------------

  if (state.showConstruction && state.selectedBody) {
    const selected = state.selectedBody;
    const family = BODIES[selected].satellite ? BODIES[selected].parent : selected;
    const harnessBodies: BodyId[] = [selected];
    for (const id of BODY_IDS) {
      if (id !== selected && BODIES[id].satellite && BODIES[id].parent === family) {
        harnessBodies.push(id);
      }
    }

    const roleColor: Partial<Record<string, string>> = {
      deferent: palette.brassDark,
      epicycle: palette.brass,
      orbit: palette.brass,
      'deferent-arm': palette.brass,
      'epicycle-arm': palette.brassBright,
      radius: palette.brassBright,
      apsidal: palette.brassDark,
    };
    const roleWidth: Partial<Record<string, number>> = {
      deferent: 1,
      epicycle: 1,
      orbit: 1,
      'deferent-arm': 1.5,
      'epicycle-arm': 1.5,
      radius: 1.5,
      apsidal: 1,
    };

    for (const body of harnessBodies) {
      const construction = buildConstruction(state, body);
      if (!construction) continue;

      for (const curve of construction.curves) {
        const projected = curve.points.map(project);
        let run: { x: number; y: number }[] = [];
        for (let i = 0; i < curve.points.length; i++) {
          if (i > 0) {
            const gap = Math.hypot(
              curve.points[i]!.x - curve.points[i - 1]!.x,
              curve.points[i]!.y - curve.points[i - 1]!.y,
            );
            if (gap > 0.6) {
              parts.push(polylineTag(run, roleColor[curve.role] ?? palette.brassDark, roleWidth[curve.role] ?? 1, 0.85));
              run = [];
            }
          }
          run.push(projected[i]!);
        }
        parts.push(polylineTag(run, roleColor[curve.role] ?? palette.brassDark, roleWidth[curve.role] ?? 1, 0.85));
      }

      for (const arm of construction.arms) {
        parts.push(
          lineTag(
            project(arm.from),
            project(arm.to),
            roleColor[arm.role] ?? palette.brass,
            roleWidth[arm.role] ?? 1,
            arm.role === 'apsidal' ? 0.5 : 0.9,
            arm.role === 'apsidal' ? '4 5' : undefined,
          ),
        );
      }

      for (const marker of construction.markers) {
        const at = project(marker.at);
        if (marker.role === 'equant') {
          parts.push(diamondTag(at, 5, palette.parchment, palette.brassBright));
        } else if (marker.role === 'focus') {
          parts.push(circleTag(at, 4.5, 'none', palette.brassBright, 1.5));
        } else {
          parts.push(circleTag(at, 4.5, 'none', palette.brassDark, 1));
        }
      }
    }

    const vectors: ProjectedVector[] | null = buildDynamicsView(state, selected);
    if (vectors) {
      for (const vector of vectors) {
        const tint =
          vector.role === 'velocity'
            ? palette.velocityTint
            : vector.role === 'net-force'
              ? palette.netForceTint
              : vector.source
                ? palette.body(vector.source)
                : palette.brassDark;
        const from = project(vector.from);
        const to = project(vector.to);
        parts.push(lineTag(from, to, tint, vector.role === 'gravity' ? 1 : 1.5, vector.role === 'gravity' ? 0.75 : 0.9));
        const angle = Math.atan2(to.y - from.y, to.x - from.x) / DEG;
        parts.push(arrowHead(to, angle, 8, 4.5, tint));
      }
    }
  }

  // --- bodies --------------------------------------------------------------

  const sunPoint = view.bodies.find((body) => body.id === 'sun')?.point ?? { x: 0, y: 0 };

  for (const body of view.bodies) {
    const at = project(body.point);
    const radius = BODY_SIZE[body.id] / 2;
    const tint = palette.body(body.id);
    const isSelected = state.selectedBody === body.id;

    parts.push(circleTag(at, radius, tint, palette.inkSoft, isSelected ? 1.5 : 0.5));
    if (body.id !== 'sun') {
      const sunAngle = Math.atan2(sunPoint.y - body.point.y, sunPoint.x - body.point.x) / DEG;
      parts.push(
        `<clipPath id="body-clip-${body.id}"><circle cx="${num(at.x)}" cy="${num(at.y)}" r="${num(radius)}"/></clipPath>` +
          `<g clip-path="url(#body-clip-${body.id})">${phaseWedge(at, radius, sunAngle, palette.shadowFill)}</g>`,
      );
    }
    if (isSelected) {
      parts.push(circleTag(at, radius + 2.5, 'none', palette.brassBright, 1.5, 0.9));
    }

    const satellite = BODIES[body.id].satellite;
    const primary = satellite ? view.bodies.find((other) => other.id === BODIES[body.id].parent) : undefined;
    const family = state.selectedBody
      ? BODIES[state.selectedBody].satellite
        ? BODIES[state.selectedBody].parent
        : state.selectedBody
      : null;
    const inFamily = family !== null && BODIES[body.id].parent === family;
    const showLabel = !satellite || (inFamily && labelHasRoom(body.point, primary?.point ?? null, state.zoom));

    if (showLabel) {
      parts.push(textTag({ x: at.x, y: at.y - radius - 4 }, bodyName(body.id), palette.textStrong, 11));
    }
  }

  // --- scale bar -----------------------------------------------------------

  if (state.scaleMode === 'true') {
    const pxPerAu = unitPx * projectRadius(1, 'true');
    const target = Math.min(180, width * 0.22);
    const bar = chooseScaleBar(pxPerAu, target);
    if (bar) {
      const y = height - 22;
      const x0 = width / 2 - bar.lengthPx / 2;
      const x1 = width / 2 + bar.lengthPx / 2;
      parts.push(lineTag({ x: x0, y }, { x: x1, y }, palette.inkSoft, 1.5));
      parts.push(lineTag({ x: x0, y: y - 4 }, { x: x0, y: y + 4 }, palette.inkSoft, 1.5));
      parts.push(lineTag({ x: x1, y: y - 4 }, { x: x1, y: y + 4 }, palette.inkSoft, 1.5));
      parts.push(
        textTag(
          { x: width / 2, y: y + 16 },
          `${formatNumber(bar.value, bar.fractionDigits)} ${t(`info.unit.${bar.unit}`)}`,
          palette.inkSoft,
          11,
        ),
      );
    }
  }

  return svgDocument(width, height, palette.surface, parts.join(''));
}
