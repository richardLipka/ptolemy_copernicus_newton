/**
 * Wiring.
 *
 * The map is full-bleed and the controls float over it in docks. Two update
 * paths, deliberately separated by cost: the instrument updates in place every
 * animation frame, while the panels rebuild only when something they show
 * actually changes. Event scanning evaluates the engine a few hundred times, so
 * it does not belong on the animation path.
 */

import './render/theme/tokens.css';
import './render/theme/theme-orrery.css';
import './render/theme/theme-atelier.css';
import './render/theme/theme-nocturne.css';
import './render/theme/theme-lcars.css';
import './render/theme/shell.css';
import './render/theme/layout.css';

import favMark from './assets/fav.svg?raw';
import kivMark from './assets/kiv.svg?raw';

import { createOrrery } from './render/orrery/orrery';
import { renderTrackStrip } from './render/track/trackStrip';
import {
  buildLongitudeTrack,
  trackCycleDays,
  trackWindowDays,
} from '@orrery/core/longitudeTrack';
import { precessionSinceJ2000 } from '@orrery/core/zodiac';
import { renderEventPanel } from './render/event-panel/eventPanel';
import { renderInfoPanel } from './render/info-panel/infoPanel';
import { applyTheme } from './render/theme/themes';
import { renderControls } from './ui/controls';
import { renderTimeDock } from './ui/timeDock';
import { renderTopBar } from './ui/topBar';
import { renderCalculationOverlay } from './ui/calculationOverlay';
import { renderWelcome } from './ui/welcome';
import { el } from './ui/dom';
import { dateFromJd } from '@orrery/core/time';
import { formatDateTime, setLocale, t } from './i18n/i18n';
import { ENGINES } from '@orrery/core/engines/registry';
import { store } from './state/store';
import { applyNotes } from './state/preferences';
import { encodeUrlState, readUrlState, writeUrlState } from './state/urlState';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

/**
 * The same element, in a binding TypeScript will trust inside a closure.
 *
 * The null check above narrows `root` at the top level only; a function body is
 * checked as if it could run at any time, so it sees the wider type.
 */
const app: HTMLDivElement = root;

setLocale(store.get().locale);
applyTheme(store.get().theme);
applyNotes(store.get().showNotes);
document.title = t('app.title');

// --- structure -----------------------------------------------------------

/**
 * The region the instrument is measured against.
 *
 * Inset by the dock widths, so the map centres in the gap the user can actually
 * see and the zodiac ring's labels stay clear of the floating panels — even
 * though the drawing itself may pass beneath them.
 */
const field = document.createElement('div');
field.className = 'stage__field';

const dockLeft = document.createElement('div');
dockLeft.className = 'dock dock--left';

const dockTopRight = document.createElement('div');
dockTopRight.className = 'dock dock--top-right';

const dockRight = document.createElement('div');
dockRight.className = 'dock dock--right';

const dockBottomRight = document.createElement('div');
dockBottomRight.className = 'dock dock--bottom-right';

/*
 * renderTimeDock() replaces the *whole* contents of whatever container it is
 * given, every time the controls rebuild (theme, locale, play/pause, rate…).
 * Handing it dockBottomRight directly would wipe the credit line below along
 * with the panel it is meant to sit under, so the clock gets its own host.
 */
const timeDockHost = document.createElement('div');
timeDockHost.style.display = 'contents';
dockBottomRight.appendChild(timeDockHost);

const credit = el('footer', 'credit');
credit.append(`${t('footer.copyright', { year: new Date().getFullYear() })} · `);

const contactLink = el('a', undefined, 'lipka@fav.zcu.cz');
contactLink.href = 'mailto:lipka@fav.zcu.cz';
credit.append(contactLink, ' · ');

const homeLink = el('a', undefined, 'home.zcu.cz/~lipka');
homeLink.href = 'https://home.zcu.cz/~lipka/';
homeLink.target = '_blank';
homeLink.rel = 'noopener noreferrer';
credit.appendChild(homeLink);

/*
 * The two institutional marks, inlined rather than linked as <img>.
 *
 * Both ship from kiv.zcu.cz as flat white artwork, meant for the dark header
 * they sit in there. This app has four themes, two of them light, so a white
 * mark would be invisible on parchment. Inlining the SVG lets every fill be
 * `currentColor`, and the mark then takes the footer's own ink in whichever
 * theme is running — one asset, four looks, no recolouring code.
 */
const marks = el('div', 'credit__marks');
for (const [markup, href, label, extra] of [
  [favMark, 'https://www.fav.zcu.cz/', 'Fakulta aplikovaných věd ZČU', ''],
  [
    kivMark,
    'https://www.kiv.zcu.cz/',
    'Katedra informatiky a výpočetní techniky',
    ' credit__mark--wordmark',
  ],
] as const) {
  const link = el('a', `credit__mark${extra}`);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = label;
  link.setAttribute('aria-label', label);
  link.innerHTML = markup;
  // The mark is decorative once the link carries the name.
  link.firstElementChild?.setAttribute('aria-hidden', 'true');
  link.firstElementChild?.setAttribute('focusable', 'false');
  marks.appendChild(link);
}
credit.appendChild(marks);
dockBottomRight.appendChild(credit);

/** Wrapper the narrow-viewport rules turn into a stacked column. */
const dockStack = document.createElement('div');
dockStack.className = 'dock-stack';
dockStack.append(dockTopRight, dockRight, dockBottomRight, dockLeft);

root.append(field, dockStack);

const masthead = document.createElement('header');
masthead.className = 'masthead panel';
dockLeft.appendChild(masthead);

const controlsHost = document.createElement('div');
controlsHost.style.display = 'contents';
dockLeft.appendChild(controlsHost);

const infoHost = document.createElement('div');
infoHost.style.display = 'contents';
const eventsHost = document.createElement('div');
eventsHost.style.display = 'contents';
dockRight.append(infoHost, eventsHost);

/**
 * The overlay lives outside the docks, so it can cover the whole stage and is
 * not caught by the dock rules that stop wheel and double-click events.
 */
const overlayHost = document.createElement('div');
overlayHost.className = 'overlay';
overlayHost.hidden = true;
root.appendChild(overlayHost);

/** The welcome sits above everything, including the calculation overlay. */
const welcomeHost = document.createElement('div');
welcomeHost.className = 'overlay overlay--welcome';
welcomeHost.hidden = true;
root.appendChild(welcomeHost);

/*
 * The longitude strip sits above the map, inside the stage rather than a dock:
 * it is a second view of the same instant, not a control, and it spans the full
 * width the map has.
 */
const trackHost = document.createElement('div');
trackHost.className = 'track-host';
trackHost.hidden = true;
root.appendChild(trackHost);

const orrery = createOrrery(field, store);

/** Handed back by the time dock so the clock can update without a rebuild. */
let dateInput: HTMLInputElement | null = null;
let clockReadout: HTMLElement | null = null;

function renderMasthead(): void {
  masthead.replaceChildren();
  const title = document.createElement('h1');
  title.className = 'masthead__title';
  title.textContent = t('app.title');
  const subtitle = document.createElement('p');
  subtitle.className = 'masthead__subtitle';
  subtitle.textContent = t('app.subtitle');
  masthead.append(title, subtitle);
}

// --- update budgets ------------------------------------------------------

/**
 * Rebuild budgets, in wall-clock milliseconds.
 *
 * Throttling against simulated time does not work: the rate control makes
 * simulated days pass arbitrarily fast, so a "once per simulated day" budget
 * becomes once per frame at 400 days/s. Real elapsed time is the only measure
 * that holds however fast the clock is spun.
 */
const INFO_BUDGET_MS = 200;
const EVENT_BUDGET_MS = 600;

/** How far the date may drift before the event window is rescanned, days. */
const EVENT_RESCAN_DAYS = 25;

/**
 * What the interactive panels depend on — deliberately *not* the date.
 *
 * These hold the only interactive elements in the app, and replacing a button
 * mid-gesture swallows the click meant for it. Nothing here may vary with time,
 * or the transport controls would be torn down under the pointer while the clock
 * ran, which is exactly how the stop button once came to appear broken.
 */
function controlsSignature(): string {
  const state = store.get();
  return [
    state.mode,
    state.engineId,
    state.ghostEngineId,
    state.frameOrigin,
    state.observationPoint,
    state.zodiacScheme,
    state.sphereCentre,
    state.scaleMode,
    state.showOrbits,
    state.showSightLines,
    state.showStarFigures,
    state.showConstruction,
    state.selectedBody,
    state.locale,
    state.theme,
    // The prose itself hides via CSS, but the top bar's toggle has to redraw
    // to show which way it is set.
    state.showNotes,
    state.playing,
    state.rateDaysPerSecond,
  ].join('|');
}

/**
 * The overlay's own dependencies.
 *
 * It shows four models' working for the selected body, so it must follow the
 * selection and the date — but rebuilding it per frame would evaluate four
 * engines on the animation path, hence the same wall-clock budget the info
 * panel uses.
 */
function overlaySignature(): string {
  const state = store.get();
  return [
    state.showCalculation,
    state.showWelcome,
    state.selectedBody,
    state.observationPoint,
    state.locale,
  ].join('|');
}

const OVERLAY_BUDGET_MS = 250;
let lastOverlay = '';
let lastOverlayAt = 0;

/** What the read-only panels depend on, excluding the date. */
function contextSignature(): string {
  const state = store.get();
  return [
    state.engineId,
    state.ghostEngineId,
    state.frameOrigin,
    state.observationPoint,
    state.zodiacScheme,
    state.scaleMode,
    state.locale,
    state.theme,
  ].join('|');
}

let lastControls = '';
let lastContext = '';
let lastRing = '';
let lastSelected: string | null = null;

let lastInfoAt = 0;
let lastEventAt = 0;
let lastEventScanJd = Number.NaN;
/** Whether the event panel has been drawn at least once. */
let eventsRendered = false;

/**
 * Redraw the longitude strip when anything it depends on moves.
 *
 * Rebuilt on a signature rather than every frame: it samples the engine 240
 * times, which is far too much to do at 60Hz, and none of its inputs change
 * during ordinary playback except the date. The date only shifts the playhead
 * and the window, so it is quantised to whole days — a strip spanning two years
 * cannot show a difference finer than that anyway.
 */
let lastTrackSignature = '';

function renderTrack(): void {
  const state = store.get();
  trackHost.hidden = !state.showTrack;
  // The field is inset to match, so the strip never covers the zodiac ring —
  // the ResizeObserver in orrery.ts refits the map on its own.
  app.dataset.track = state.showTrack ? 'on' : 'off';
  if (!state.showTrack || !state.selectedBody) {
    if (state.showTrack) {
      trackHost.replaceChildren(el('p', 'note track-host__empty', t('track.none')));
    }
    lastTrackSignature = '';
    return;
  }

  const signature = [
    state.selectedBody,
    state.observationPoint,
    state.engineId,
    state.zodiacScheme,
    state.locale,
    Math.round(state.julianDate),
  ].join('|');
  if (signature === lastTrackSignature) return;
  lastTrackSignature = signature;

  const observer = state.observationPoint;
  const target = state.selectedBody;
  const windowDays = trackWindowDays(observer, target);

  renderTrackStrip(trackHost, {
    track: buildLongitudeTrack(
      ENGINES[state.engineId].positionsAt,
      state.julianDate,
      observer,
      target,
      windowDays,
    ),
    target,
    observer,
    julianDate: state.julianDate,
    cycleDays: trackCycleDays(observer, target),
    zodiacScheme: state.zodiacScheme,
    // The same offset the ring applies, so the two agree about where a sign is.
    precession:
      state.zodiacScheme === 'signs' ? -precessionSinceJ2000(state.julianDate) : 0,
  });
}

function render(): void {
  const state = store.get();
  const now = performance.now();
  const context = contextSignature();
  const contextChanged = context !== lastContext;
  lastContext = context;

  orrery.update();
  renderTrack();

  const reading = formatDateTime(dateFromJd(state.julianDate));
  if (clockReadout && clockReadout.textContent !== reading) {
    clockReadout.textContent = reading;
  }

  // Updated in place rather than rebuilt, so typing into it is not interrupted.
  if (dateInput && document.activeElement !== dateInput) {
    const value = dateFromJd(state.julianDate).toISOString().slice(0, 10);
    if (dateInput.value !== value) dateInput.value = value;
  }

  const ring = `${state.zodiacScheme}|${state.locale}|${Math.round(state.julianDate / 3652.5)}`;
  if (ring !== lastRing) {
    lastRing = ring;
    orrery.rebuildRing();
  }

  const controls = controlsSignature();
  if (controls !== lastControls) {
    lastControls = controls;
    renderMasthead();
    renderTopBar(dockTopRight, store);
    renderControls(controlsHost, store);
    const dock = renderTimeDock(timeDockHost, store);
    dateInput = dock.dateInput;
    clockReadout = dock.clock;
    clockReadout.textContent = reading;
    document.title = t('app.title');
  }

  const overlay = overlaySignature();
  if (
    overlay !== lastOverlay ||
    (state.showCalculation && now - lastOverlayAt > OVERLAY_BUDGET_MS)
  ) {
    lastOverlay = overlay;
    lastOverlayAt = now;
    renderCalculationOverlay(overlayHost, store);
    renderWelcome(welcomeHost, store);
  }

  if (contextChanged || state.selectedBody !== lastSelected || now - lastInfoAt > INFO_BUDGET_MS) {
    lastInfoAt = now;
    lastSelected = state.selectedBody;
    renderInfoPanel(infoHost, store);
  }

  // Event scanning evaluates the engine several hundred times, so it is driven
  // by how far the date has actually moved rather than by every change to it.
  //
  // The first pass ignores the budget. The budget is measured from process
  // start, so an app that boots in under EVENT_BUDGET_MS would skip its only
  // render and — with the clock paused and nothing else changing — never show
  // the panel at all.
  const drifted =
    Number.isNaN(lastEventScanJd) ||
    Math.abs(state.julianDate - lastEventScanJd) > EVENT_RESCAN_DAYS;
  const withinBudget = eventsRendered && now - lastEventAt <= EVENT_BUDGET_MS;
  if ((contextChanged || drifted) && !withinBudget) {
    eventsRendered = true;
    lastEventAt = now;
    lastEventScanJd = state.julianDate;
    renderEventPanel(eventsHost, store);
  }
}

// --- zoom ----------------------------------------------------------------

/**
 * How sharply the wheel bites. Applied to an exponential, so a notch multiplies
 * rather than adds and zooming feels the same at every magnification.
 */
const ZOOM_SENSITIVITY = 0.0016;

/** Rough pixel equivalents, for wheels that report lines or pages. */
const DELTA_TO_PIXELS = [1, 16, 400];

/** What one press of the zoom key multiplies by. See the key handler. */
const KEY_ZOOM_STEP = 1.5;

/**
 * Wheel zoom, listened for on the whole app rather than the instrument.
 *
 * The instrument's box is smaller than the area its drawing covers once
 * magnified, so binding to it would leave dead zones. Events originating inside
 * a dock are left alone, or the panels could not be scrolled.
 */
root.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    if ((event.target as Element | null)?.closest('.dock')) return;
    event.preventDefault();
    const pixels = event.deltaY * (DELTA_TO_PIXELS[event.deltaMode] ?? 1);
    store.zoomBy(Math.exp(-pixels * ZOOM_SENSITIVITY));
  },
  { passive: false },
);

/**
 * Double-click clears the magnification *and* the drag, since neither the wheel
 * nor a pan offers an obvious way back to the fitted view.
 */
root.addEventListener('dblclick', (event: MouseEvent) => {
  if ((event.target as Element | null)?.closest('.dock')) return;
  store.resetZoom();
});

// --- panning -------------------------------------------------------------

/**
 * How far the pointer must travel before a press becomes a drag, in pixels.
 *
 * Without it every click on a planet would pan the map by the two or three
 * pixels a hand moves while pressing a button, and selecting Mars would nudge
 * the sky each time.
 */
const DRAG_THRESHOLD_PX = 3;

let dragPointer: number | null = null;
let dragX = 0;
let dragY = 0;
let dragging = false;

const instrumentEl = (): HTMLElement | null => root.querySelector('.instrument');

root.addEventListener('pointerdown', (event: PointerEvent) => {
  // Docks scroll, overlays are read; neither should move the map underneath.
  const target = event.target as Element | null;
  if (target?.closest('.dock') || target?.closest('.overlay')) return;
  if (event.button !== 0) return;

  dragPointer = event.pointerId;
  dragX = event.clientX;
  dragY = event.clientY;
  dragging = false;
});

root.addEventListener('pointermove', (event: PointerEvent) => {
  if (dragPointer !== event.pointerId) return;

  const dx = event.clientX - dragX;
  const dy = event.clientY - dragY;

  if (!dragging) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragging = true;
    instrumentEl()?.setAttribute('data-dragging', 'on');

    // Keep receiving moves even when the pointer leaves the element, so a drag
    // that runs off the map does not stick. Guarded because capture throws
    // NotFoundError if the pointer is no longer active — which can happen
    // between a move and its handler — and an exception here would abort the
    // rest of this handler and drop the frame's pan.
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      // Without capture the drag still works; it just ends if the pointer
      // leaves the element.
    }
  }

  dragX = event.clientX;
  dragY = event.clientY;

  const unit = orrery.unitPx();
  if (unit > 0) store.panBy(dx / unit, dy / unit);
});

// An arrow rather than a declaration: a hoisted function is analysed above the
// `if (!root) throw` guard, so TypeScript loses the non-null narrowing there.
const endDrag = (event: PointerEvent): void => {
  if (dragPointer !== event.pointerId) return;
  if (dragging && root.hasPointerCapture(event.pointerId)) {
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {
      // Already released, or the pointer is gone. Either way there is nothing
      // left to let go of.
    }
  }
  dragPointer = null;
  instrumentEl()?.removeAttribute('data-dragging');
  // Cleared on the next tick so the click this pointerup generates can still be
  // suppressed — a drag that ends over Mars must not also select it.
  setTimeout(() => {
    dragging = false;
  }, 0);
};

root.addEventListener('pointerup', endDrag);
root.addEventListener('pointercancel', endDrag);

root.addEventListener(
  'click',
  (event: MouseEvent) => {
    if (!dragging) return;
    event.stopPropagation();
    event.preventDefault();
  },
  true,
);

// --- keyboard ------------------------------------------------------------

/**
 * Transport keys, for the lectern.
 *
 * This is a teaching tool that gets driven from the front of a room, where
 * hunting for a small button on a projected screen is its own small disaster.
 * Space plays, the arrows step a day.
 *
 * Ignored while a control has focus, or space would toggle the button under the
 * cursor and the arrows would walk a select through its options.
 */
window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    if (store.get().showWelcome) {
      store.dismissWelcome();
      return;
    }
    if (store.get().showCalculation) {
      store.setCalculationOpen(false);
      return;
    }
  }

  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  switch (event.key) {
    case ' ':
      if (active instanceof HTMLButtonElement) return;
      event.preventDefault();
      store.togglePlay();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      store.stepDays(-1);
      break;
    case 'ArrowRight':
      event.preventDefault();
      store.stepDays(1);
      break;
    /*
     * Zoom by the keyboard as well as the wheel.
     *
     * At true scale the ceiling is a thousand times, and the wheel's
     * exponential needs some forty notches to climb it — far enough that the
     * lunar orbit is technically reachable and practically not. A key that
     * multiplies by half again gets there in seventeen presses, and auto-repeat
     * makes it one held key.
     */
    case '+':
    case '=':
      event.preventDefault();
      store.zoomBy(KEY_ZOOM_STEP);
      break;
    case '-':
    case '_':
      event.preventDefault();
      store.zoomBy(1 / KEY_ZOOM_STEP);
      break;
    default:
      break;
  }
});

// --- shareable configuration --------------------------------------------

/**
 * Keep the address bar showing the current arrangement, and honour one that
 * arrives in a link.
 *
 * The guard matters: writing the hash fires `hashchange`, which would read it
 * straight back and re-hydrate the store on every click. Comparing against what
 * was last written breaks that loop while still letting a genuine navigation —
 * the back button, or a pasted link — through.
 */
let lastWrittenHash = '';
let lastUrlWriteAt = 0;

/**
 * Least time between URL writes while the clock is running, milliseconds.
 *
 * The date advances every frame during playback, and browsers rate-limit
 * `replaceState` — Safari throttles it outright and logs a warning.
 *
 * The throttle applies *only* while playing. A creeping date that nobody is
 * copying can wait; a deliberate jump — stepping a day, pressing Today, picking
 * a date, pausing — is exactly the moment someone might reach for the address
 * bar, and must land at once. Without that distinction the URL was left showing
 * whatever date the last throttled write happened to catch.
 */
const URL_DATE_BUDGET_MS = 500;

function currentUrlState() {
  const state = store.get();
  return {
    mode: state.mode,
    engineId: state.engineId,
    frameOrigin: state.frameOrigin,
    observationPoint: state.observationPoint,
    sphereCentre: state.sphereCentre,
    julianDate: state.julianDate,
  };
}

function syncUrl(): void {
  const next = currentUrlState();
  const encoded = encodeUrlState(next);
  if (encoded === lastWrittenHash) return;

  // Was anything but the date touched? Those go out immediately.
  const configurationChanged =
    encodeUrlState({ ...next, julianDate: undefined }) !==
    encodeUrlState({ ...readUrlState(lastWrittenHash), julianDate: undefined });

  const now = performance.now();
  const throttled =
    store.get().playing && !configurationChanged && now - lastUrlWriteAt < URL_DATE_BUDGET_MS;
  if (throttled) return;

  lastUrlWriteAt = now;
  lastWrittenHash = encoded;
  writeUrlState(next);
}

window.addEventListener('hashchange', () => {
  if (window.location.hash === lastWrittenHash) return;
  lastWrittenHash = window.location.hash;
  store.hydrate(readUrlState());
});

// A link's configuration is applied before the first render, so the app never
// flashes its defaults on the way to what was actually shared.
const shared = readUrlState();
if (Object.keys(shared).length > 0) store.hydrate(shared);

store.subscribe(syncUrl);
store.subscribe(render);

// Write it once at startup too, so the address bar describes the arrangement
// from the outset rather than only after the reader has touched something.
syncUrl();

/**
 * Longest real interval a single frame may represent, seconds.
 *
 * Browsers suspend animation frames in a hidden tab, so the first frame after
 * one is revealed reports the entire time it spent hidden. Left unclamped, that
 * whole interval is multiplied by the time rate: a minute in another tab at 400
 * days a second would jump the clock by sixty-five years and, worse, do it in
 * one step the n-body integrator would have to swallow whole.
 *
 * Clamping means simulated time pauses while the tab is away rather than
 * catching up, which is also the more useful behaviour.
 */
const MAX_FRAME_SECONDS = 0.1;

let previousTimestamp = performance.now();
function frame(timestamp: number): void {
  const elapsedSeconds = Math.min(
    (timestamp - previousTimestamp) / 1000,
    MAX_FRAME_SECONDS,
  );
  previousTimestamp = timestamp;
  store.tick(elapsedSeconds);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

render();
