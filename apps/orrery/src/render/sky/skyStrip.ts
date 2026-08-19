/**
 * The band of sky: what the observer would be looking at.
 *
 * Drawn the way everything else here is drawn — elements placed by CSS custom
 * properties, no canvas and no SVG. Marks carry their position in **degrees**
 * and one variable, `--sky-scale`, says how many pixels a degree is worth. The
 * band is therefore undistorted by construction: a degree across is the same
 * length as a degree up, so an angular separation on screen is an angular
 * separation in the sky, and Mars a degree from Antares looks it.
 *
 * That scale comes from the band's own width, so it is measured rather than
 * assumed, and only when the element resizes. Which patch of sky fits above and
 * below the ecliptic then follows from the height rather than being decided:
 * widen the window and the band shows the same longitudes over fewer degrees of
 * latitude, which is what an undistorted chart does.
 *
 * Built once and updated in place. The point of the thing is to run the clock
 * and watch a planet creep against fixed stars — and turn back on itself, which
 * is the observation the whole app is about — so it has to be on the animation
 * path, and rebuilding forty elements a frame would put it there expensively.
 */

import type { BodyId } from '@orrery/core/bodies';
import { bodyName, formatNumber, t } from '../../i18n/i18n';
import { buildSkyView, type SkyView } from '../../state/skyView';
import type { Store } from '../../state/store';

const div = (className: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = className;
  return element;
};

/**
 * Drawn size of a body in the band, px.
 *
 * Not to scale, and it could not be: at the widest field here Jupiter is four
 * hundredths of a degree across, which is a third of a pixel. These are the
 * map's proportions brought down to a size that reads in a band — big enough to
 * carry a lit side, small enough that two of them in conjunction stay two.
 */
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

/**
 * How wide a star is drawn, px, from its magnitude.
 *
 * Magnitudes are logarithmic and run the wrong way — smaller is brighter — so
 * this is the usual chart convention rather than anything photometric: a fixed
 * size for the brightest, shrinking by a fixed amount per magnitude, with a
 * floor so a third-magnitude star is still a mark rather than a hint.
 */
export const starSize = (magnitude: number): number =>
  Math.max(1.6, 5.4 - Math.max(0, magnitude + 0.5) * 0.95);

/** Below this separation from the Sun the field is a daylight one. */
const DAYLIGHT_DEG = 12;

/**
 * How sharply the wheel bites on the field, and the pixel equivalents for
 * wheels that report lines or pages.
 *
 * The same shape as the map's zoom — an exponential, so a notch multiplies
 * rather than adds and the gesture feels the same at four degrees as at a
 * hundred — and deliberately the same sensitivity, so the two zooms feel like
 * one instrument even though they move different things.
 */
const FIELD_SENSITIVITY = 0.0016;
const WHEEL_PIXELS = [1, 16, 400];

/**
 * A field runs from a fifth of a degree to a hundred and twenty, so the number
 * of decimals worth printing is not fixed.
 */
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
  band.append(ecliptic, divisionLayer, starLayer, bodyLayer);
  host.append(band, caption);

  /*
   * Pixels per degree, from the band's own width, and the latitudes that then
   * fit above and below.
   *
   * The width is what sets the scale, so the field asked for is the field
   * drawn. What that leaves vertically is not chosen but measured — a band four
   * times as wide as it is tall shows a quarter as many degrees of latitude as
   * of longitude — and it is reported in the caption rather than assumed,
   * because on a wide window it is only a few degrees.
   *
   * Read on resize rather than per frame: it changes when the window does and
   * at no other time, and reading it back forces a layout.
   */
  let latitudeSpan = 0;

  const fitScale = (): void => {
    const width = band.clientWidth;
    const height = band.clientHeight;
    if (width <= 0) return;

    const scale = width / store.get().skyField;
    band.style.setProperty('--sky-scale', String(scale));
    latitudeSpan = height / scale;
  };
  new ResizeObserver(fitScale).observe(band);

  /*
   * The band's own zoom.
   *
   * Separate from the map's in every sense: a different quantity, a different
   * range, and a different piece of state. What the wheel means here is how much
   * sky to show, and there is no magnification of a plan of the solar system
   * that corresponds to it.
   *
   * Bound to the band rather than filtered out of the app-wide handler so the
   * two can never both fire. `preventDefault` stops the page scrolling under
   * the gesture; the map's handler is on an ancestor and never sees it.
   */
  band.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const pixels = event.deltaY * (WHEEL_PIXELS[event.deltaMode] ?? 1);
      // Wheel down widens the field, which is zooming out — the same direction
      // the map takes, on a quantity that runs the other way.
      store.zoomSkyBy(Math.exp(pixels * FIELD_SENSITIVITY));
    },
    { passive: false },
  );

  // The way back, as double-clicking the map is the way back from a pan.
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
    /** The lit hemisphere and the terminator across it, as the info panel draws them. */
    half: HTMLDivElement;
    terminator: HTMLDivElement;
    label: HTMLDivElement;
  }

  const starPool: StarParts[] = [];
  const bodyPool = new Map<BodyId, BodyParts>();
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

      /*
       * The same three pieces the info panel's phase disc is built from: a
       * shadowed ground, the lit half, and a terminator ellipse across it whose
       * width is |cos i|. Not the map's technique — the map draws a plan view,
       * where exactly half of every body is lit and only the direction changes.
       * Here the observer is looking at it, so the *fraction* is the point.
       */
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

  /*
   * Placed against the middle of the band, which is the target rather than the
   * ecliptic — see `centreLatitude`. Latitudes stay real; what changes is where
   * zero sits.
   */
  let centreLatitude = 0;

  const place = (element: HTMLElement, offset: number, latitude: number): void => {
    element.style.setProperty('--dlon', offset.toFixed(4));
    element.style.setProperty('--dlat', (latitude - centreLatitude).toFixed(4));
  };

  let lastField = 0;

  function draw(view: SkyView): void {
    if (view.field !== lastField) {
      lastField = view.field;
      fitScale();
    }

    centreLatitude = view.centreLatitude;
    // The ecliptic is no longer down the middle, so it is placed like anything
    // else: at its own offset from the body being looked at.
    ecliptic.style.setProperty('--dlat', (-centreLatitude).toFixed(4));

    let usedStars = 0;
    for (const star of view.stars) {
      const parts = takeStar(usedStars++);
      place(parts.mark, star.offset, star.latitude);
      parts.mark.style.setProperty('--size', starSize(star.magnitude).toFixed(2));
      parts.mark.style.display = '';
      parts.mark.title = `${star.name} · ${star.designation} · ${formatNumber(star.magnitude, 1)} mag`;

      // Names only for the ones an observer would have used as landmarks.
      // Every star labelled turns a band into a page of text.
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

      place(parts.mark, body.offset, body.latitude);
      place(parts.label, body.offset, body.latitude);
      parts.mark.style.display = '';
      parts.label.style.display = '';
      parts.label.textContent = bodyName(body.id);
      parts.mark.classList.toggle('sky__body--target', body.id === view.target);

      /*
       * The lit side, as the observer sees it.
       *
       * This is Galileo's argument in the one place it belongs — a view of the
       * sky rather than a diagram of it. Put Venus in the band and switch model:
       * under Ptolemy it never passes half, because his nested spheres pen it
       * between the Earth and the Sun; under the other three it fills and
       * shrinks as it swings round the far side.
       *
       * The Sun is drawn full rather than asked: its own illumination is not a
       * phase, and the one number that would come back is meaningless.
       */
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

    // A field this close to the Sun is one nobody could observe. Said rather
    // than merely shaded, since the shading is easy to read as decoration.
    const daylight = view.solarDistance < DAYLIGHT_DEG;
    band.dataset.daylight = daylight ? 'on' : 'off';

    const target = view.bodies.find((body) => body.id === view.target);
    const parts = [
      t('sky.caption', {
        body: bodyName(view.target),
        observer: bodyName(view.observer, 'genitive'),
        field: formatDegrees(view.field),
        // Stated rather than implied: on a wide window this is a couple of
        // degrees, and a reader is owed the reason the Moon left the band.
        height: formatDegrees(latitudeSpan),
      }),
    ];
    if (target) {
      parts.push(
        t('sky.centre', {
          longitude: `${formatNumber(target.longitude, 1)}${t('info.unit.deg')}`,
        }),
      );
    }
    if (daylight) parts.push(t('sky.daylight'));
    if (view.flatLatitudes) parts.push(t('sky.flat'));
    caption.textContent = parts.join(' · ');
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
