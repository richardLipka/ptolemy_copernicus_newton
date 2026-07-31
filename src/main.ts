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

import { createOrrery } from './render/orrery/orrery';
import { renderEventPanel } from './render/event-panel/eventPanel';
import { renderInfoPanel } from './render/info-panel/infoPanel';
import { applyTheme } from './render/theme/themes';
import { renderControls } from './ui/controls';
import { renderTimeDock } from './ui/timeDock';
import { renderTopBar } from './ui/topBar';
import { renderCalculationOverlay } from './ui/calculationOverlay';
import { el } from './ui/dom';
import { dateFromJd } from './core/time';
import { formatDateTime, setLocale, t } from './i18n/i18n';
import { store } from './state/store';
import { encodeUrlState, readUrlState, writeUrlState } from './state/urlState';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

setLocale(store.get().locale);
applyTheme(store.get().theme);
document.title = t('app.title');

// --- structure -----------------------------------------------------------

const stage = document.createElement('div');
stage.className = 'stage';

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
homeLink.href = 'http://home.zcu.cz/~lipka';
homeLink.target = '_blank';
homeLink.rel = 'noopener noreferrer';
credit.appendChild(homeLink);
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

function render(): void {
  const state = store.get();
  const now = performance.now();
  const context = contextSignature();
  const contextChanged = context !== lastContext;
  lastContext = context;

  orrery.update();

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

/** Double-click clears the magnification, since the wheel offers no way back. */
root.addEventListener('dblclick', (event: MouseEvent) => {
  if ((event.target as Element | null)?.closest('.dock')) return;
  store.resetZoom();
});

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
  if (event.key === 'Escape' && store.get().showCalculation) {
    store.setCalculationOpen(false);
    return;
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
