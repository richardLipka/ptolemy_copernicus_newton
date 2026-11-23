/**
 * The band of sky: what the observer would be looking at.
 *
 * Drawn the way everything else here is drawn — elements placed by CSS custom
 * properties, no canvas and no SVG. Supports multi-model comparison ghosts so
 * rival models' placements, ecliptic latitudes, and phases appear directly
 * against the same star field, and draws the Sun at true angular diameter at
 * narrow fields (<= 8°) so solar transits like 1631 Mercury read literally.
 */

import type { BodyId } from '@orrery/core/bodies';
import type { EngineId, ModeId } from '@orrery/core/engines/types';
import { bodyName, formatNumber, t } from '../../i18n/i18n';
import { buildSkyView, type SkyView } from '../../state/skyView';
import type { Store } from '../../state/store';

const div = (className: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = className;
  return element;
};

const MODEL_OF_ENGINE: Partial<Record<EngineId, ModeId>> = {
  'ptolemaic-epicyclic': 'ptolemy',
  'ptolemaic-almagest': 'ptolemy',
  'ptolemaic-reframe': 'ptolemy',
  copernican: 'copernicus',
  circular: 'copernicus',
  keplerian: 'kepler',
  nbody: 'newton',
};

/** Drawn size of a body in the band, px. */
const BODY_SIZE: Record<BodyId, number> = {
  sun: 16,
  mercury: 7,
  venus: 9,
  earth: 9,
  moon: 13,
  mars: 8,
  jupiter: 11,
  saturn: 10,
  io: 5,
  europa: 5,
  ganymede: 6,
  callisto: 5,
  titan: 6,
};

/** How wide a star is drawn, px, from its magnitude. */
export const starSize = (magnitude: number): number =>
  Math.max(1.6, 5.4 - Math.max(0, magnitude + 0.5) * 0.95);

/** Below this separation from the Sun the field is a daylight one. */
const DAYLIGHT_DEG = 12;

/** Below this field width, draw the Sun at its true angular diameter (~0.53°). */
const TRUE_SUN_FIELD_DEG = 8;

const FIELD_SENSITIVITY = 0.0016;
const WHEEL_PIXELS = [1, 16, 400];

const formatDegrees = (degrees: number): string =>
  formatNumber(degrees, degrees < 1 ? 2 : degrees < 10 ? 1 : 0);

/** A name is only printed beside a star this bright or better. */
const STAR_LABEL_MAGNITUDE = 2.7;

export interface SkyStrip {
  /** Redraw from the current state. Cheap enough for the animation path. */
  update(): void;
}

export function createSkyStrip(host: HTMLElement, store: Store): SkyStrip {
  host.replaceChildren();

  const band = div('sky');
  const caption = div('sky__caption');
  const ecliptic = div('sky__ecliptic');
  const starLayer = div('sky__layer');
  const divisionLayer = div('sky__layer');
  const bodyLayer = div('sky__layer');
  const ghostLayer = div('sky__layer');
  band.append(ecliptic, divisionLayer, starLayer, bodyLayer, ghostLayer);
  host.append(band, caption);

  let latitudeSpan = 0;
  let currentScale = 20;
  let lastBandWidth = 0;
  let lastView: SkyView | null = null;

  const fitScale = (): void => {
    const width = band.clientWidth;
    const height = band.clientHeight;
    if (width <= 0) return;

    currentScale = width / store.get().skyField;
    band.style.setProperty('--sky-scale', String(currentScale));
    latitudeSpan = height / currentScale;
  };
  new ResizeObserver(() => {
    const width = band.clientWidth;
    if (width <= 0) return;
    fitScale();
    if (width !== lastBandWidth && lastView) {
      lastBandWidth = width;
      draw(lastView);
    }
  }).observe(band);

  band.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const pixels = event.deltaY * (WHEEL_PIXELS[event.deltaMode] ?? 1);
      store.zoomSkyBy(Math.exp(pixels * FIELD_SENSITIVITY));
    },
    { passive: false },
  );

  band.addEventListener('dblclick', (event: MouseEvent) => {
    event.stopPropagation();
    store.resetSkyField();
  });

  interface StarParts {
    mark: HTMLDivElement;
    label: HTMLDivElement;
  }
  interface BodyParts {
    mark: HTMLDivElement;
    half: HTMLDivElement;
    terminator: HTMLDivElement;
    label: HTMLDivElement;
  }

  const starPool: StarParts[] = [];
  const bodyPool = new Map<BodyId, BodyParts>();
  const ghostPool: BodyParts[] = [];
  const divisionPool: HTMLDivElement[] = [];

  const takeStar = (index: number): StarParts => {
    let parts = starPool[index];
    if (!parts) {
      const mark = div('sky__star');
      const label = div('sky__star-name');
      starLayer.append(mark, label);
      parts = { mark, label };
      starPool.push(parts);
    }
    return parts;
  };

  const takeBody = (id: BodyId): BodyParts => {
    let parts = bodyPool.get(id);
    if (!parts) {
      const mark = div('sky__body');
      mark.dataset.body = id;
      mark.style.setProperty('--tint', `var(--body-${id})`);
      mark.style.setProperty('--size', String(BODY_SIZE[id]));

      const half = div('sky__half');
      const terminator = div('sky__terminator');
      mark.append(half, terminator);

      const label = div('sky__body-name');
      bodyLayer.append(mark, label);
      parts = { mark, half, terminator, label };
      bodyPool.set(id, parts);
    }
    return parts;
  };

  const takeGhost = (index: number): BodyParts => {
    let parts = ghostPool[index];
    if (!parts) {
      const mark = div('sky__body sky__ghost');
      const half = div('sky__half');
      const terminator = div('sky__terminator');
      mark.append(half, terminator);

      const label = div('sky__ghost-label');
      ghostLayer.append(mark, label);
      parts = { mark, half, terminator, label };
      ghostPool.push(parts);
    }
    return parts;
  };

  const takeDivision = (index: number): HTMLDivElement => {
    let element = divisionPool[index];
    if (!element) {
      element = div('sky__division');
      element.appendChild(div('sky__division-name'));
      divisionLayer.appendChild(element);
      divisionPool.push(element);
    }
    return element;
  };

  let centreLatitude = 0;

  const place = (element: HTMLElement, offset: number, latitude: number): void => {
    element.style.setProperty('--dlon', offset.toFixed(4));
    element.style.setProperty('--dlat', (latitude - centreLatitude).toFixed(4));
  };

  let lastField = 0;

  function draw(view: SkyView): void {
    lastView = view;
    if (view.field !== lastField) {
      lastField = view.field;
      fitScale();
    } else if (band.clientWidth > 0 && latitudeSpan === 0) {
      fitScale();
    }
    if (band.clientWidth > 0) lastBandWidth = band.clientWidth;

    centreLatitude = view.centreLatitude;
    ecliptic.style.setProperty('--dlat', (-centreLatitude).toFixed(4));

    let usedStars = 0;
    for (const star of view.stars) {
      const parts = takeStar(usedStars++);
      place(parts.mark, star.offset, star.latitude);
      parts.mark.style.setProperty('--size', starSize(star.magnitude).toFixed(2));
      parts.mark.style.display = '';
      parts.mark.title = `${star.name} · ${star.designation} · ${formatNumber(star.magnitude, 1)} mag`;

      if (star.magnitude <= STAR_LABEL_MAGNITUDE) {
        place(parts.label, star.offset, star.latitude);
        parts.label.textContent = star.name;
        parts.label.style.display = '';
      } else {
        parts.label.style.display = 'none';
      }
    }
    for (let i = usedStars; i < starPool.length; i++) {
      starPool[i]!.mark.style.display = 'none';
      starPool[i]!.label.style.display = 'none';
    }

    let usedDivisions = 0;
    for (const division of view.divisions) {
      const element = takeDivision(usedDivisions++);
      element.style.setProperty('--dlon', division.offset.toFixed(4));
      element.style.display = '';
      const name = element.firstElementChild as HTMLElement;
      name.textContent = t(`zodiac.${division.id}`);
    }
    for (let i = usedDivisions; i < divisionPool.length; i++) {
      divisionPool[i]!.style.display = 'none';
    }

    const drawn = new Set<BodyId>();
    for (const body of view.bodies) {
      const parts = takeBody(body.id);
      drawn.add(body.id);

      // At narrow telescopic fields, draw the Sun at true angular diameter so
      // transits like 1631 Mercury visibly cross (or miss) the actual solar disc.
      if (body.id === 'sun' && view.field <= TRUE_SUN_FIELD_DEG && currentScale > 0) {
        const angularDeg = body.illumination.angularDiameter / 3600;
        const sizePx = Math.max(BODY_SIZE.sun, angularDeg * currentScale);
        parts.mark.style.setProperty('--size', sizePx.toFixed(1));
      } else {
        parts.mark.style.setProperty('--size', String(BODY_SIZE[body.id]));
      }

      place(parts.mark, body.offset, body.latitude);
      place(parts.label, body.offset, body.latitude);
      parts.mark.style.display = '';
      parts.label.style.display = '';
      parts.label.textContent = bodyName(body.id);
      parts.mark.classList.toggle('sky__body--target', body.id === view.target);

      const lit = body.id === 'sun' ? 1 : body.illumination.illuminatedFraction;
      parts.mark.dataset.side = body.illumination.waxing ? 'right' : 'left';
      parts.mark.dataset.shape = lit >= 0.5 ? 'gibbous' : 'crescent';
      parts.mark.style.setProperty('--lit-width', Math.abs(2 * lit - 1).toFixed(4));
    }
    for (const [id, parts] of bodyPool) {
      if (drawn.has(id)) continue;
      parts.mark.style.display = 'none';
      parts.label.style.display = 'none';
    }

    // Rival models' placements, latitudes, and phases for the target body.
    let usedGhosts = 0;
    for (const ghost of view.ghosts) {
      const parts = takeGhost(usedGhosts++);
      const model = MODEL_OF_ENGINE[ghost.engineId] ?? 'kepler';
      const size = Math.max(10, BODY_SIZE[ghost.id] + 3);

      parts.mark.dataset.engine = ghost.engineId;
      parts.mark.dataset.model = model;
      parts.mark.style.setProperty('--size', String(size));
      parts.mark.style.setProperty('--tint', `var(--body-${ghost.id})`);
      parts.mark.style.setProperty('--model-tint', `var(--model-${model})`);

      const lit = ghost.id === 'sun' ? 1 : ghost.illumination.illuminatedFraction;
      parts.mark.dataset.side = ghost.illumination.waxing ? 'right' : 'left';
      parts.mark.dataset.shape = lit >= 0.5 ? 'gibbous' : 'crescent';
      parts.mark.style.setProperty('--lit-width', Math.abs(2 * lit - 1).toFixed(4));

      place(parts.mark, ghost.offset, ghost.latitude);
      place(parts.label, ghost.offset, ghost.latitude);
      parts.mark.style.display = '';
      parts.label.style.display = '';
      parts.label.dataset.model = model;
      parts.label.style.setProperty('--model-tint', `var(--model-${model})`);
      parts.label.textContent = t(`mode.${model}`);
    }
    for (let i = usedGhosts; i < ghostPool.length; i++) {
      ghostPool[i]!.mark.style.display = 'none';
      ghostPool[i]!.label.style.display = 'none';
    }

    const daylight = view.solarDistance < DAYLIGHT_DEG;
    band.dataset.daylight = daylight ? 'on' : 'off';

    const target = view.bodies.find((body) => body.id === view.target);
    const captionParts = [
      t('sky.caption', {
        body: bodyName(view.target),
        observer: bodyName(view.observer, 'genitive'),
        field: formatDegrees(view.field),
        height: formatDegrees(latitudeSpan),
      }),
    ];
    if (target) {
      captionParts.push(
        t('sky.centre', {
          longitude: `${formatNumber(target.longitude, 1)}${t('info.unit.deg')}`,
        }),
      );
    }
    if (daylight) captionParts.push(t('sky.daylight'));
    if (view.flatLatitudes) captionParts.push(t('sky.flat'));
    if (view.ghosts.length > 0) captionParts.push(t('sky.ghostsNote'));
    caption.textContent = captionParts.join(' · ');
  }

  return {
    update(): void {
      const state = store.get();
      const view = buildSkyView(state, state.skyField);
      if (!view) {
        band.dataset.empty = 'on';
        caption.textContent = t('sky.none');
        for (const parts of bodyPool.values()) {
          parts.mark.style.display = 'none';
          parts.label.style.display = 'none';
        }
        for (const parts of ghostPool) {
          parts.mark.style.display = 'none';
          parts.label.style.display = 'none';
        }
        for (const star of starPool) {
          star.mark.style.display = 'none';
          star.label.style.display = 'none';
        }
        for (const division of divisionPool) division.style.display = 'none';
        return;
      }

      band.dataset.empty = 'off';
      draw(view);
    },
  };
}
