/**
 * Single source of truth.
 *
 * A plain pub/sub store rather than a framework: the render layer's whole job
 * is to write CSS custom properties onto a fixed set of DOM nodes, which needs
 * change notification and nothing else.
 *
 * Switching models deliberately preserves everything except the engine. The
 * comparison the app exists to make is only honest if nothing else moves when
 * you flip between Ptolemy and Newton.
 */

import type { BodyId } from '@orrery/core/bodies';
import type { Demonstration } from '@orrery/core/demonstrations';
import { ENGINES } from '@orrery/core/engines/registry';
import { MODES, type Engine, type EngineId, type ModeId } from '@orrery/core/engines/types';
import { MAX_JD, MIN_JD, SimulationClock, clampJd, jdFromDate } from '@orrery/core/time';
import type { ZodiacScheme } from '@orrery/core/zodiac';
import { getLocale, setLocale, type Locale } from '../i18n/i18n';
import { applyTheme, readStoredTheme, type ThemeId } from '../render/theme/themes';
import { applyNotes, hasBeenWelcomed, readStoredNotes, rememberWelcome } from './preferences';
import { TrailLog } from './trails';

export type ScaleMode = 'compressed' | 'true';

/**
 * What the celestial sphere is drawn around.
 *
 * `frame` keeps it concentric with the map, the traditional orrery arrangement.
 * `observer` puts it around the observation point instead, which is where the
 * sky actually belongs: it makes sight-lines straight rays at the true apparent
 * longitude in every model, at the cost of a ring no longer centred on the
 * instrument.
 */
export type SphereCentre = 'frame' | 'observer';

/** What the ghost overlay draws: nothing, one named model, or all of them. */
export type GhostSelection = EngineId | 'all' | null;

/** The part of the state a shared link carries. See `urlState.ts`. */
export type HydratableState = Pick<
  State,
  | 'mode'
  | 'engineId'
  | 'frameOrigin'
  | 'observationPoint'
  | 'sphereCentre'
  | 'julianDate'
>;

/** Which model the app opens on. */
const INITIAL_MODE: ModeId = 'newton';

/**
 * Simulated days per real second, slowest to fastest.
 *
 * Roughly geometric: each rung is a useful step rather than an arithmetic one.
 * A quarter-day resolves the Moon; four hundred puts Saturn round in a minute.
 */
export const RATE_LADDER: readonly number[] = [0.25, 1, 5, 20, 100, 400];

/**
 * Zoom limits.
 *
 * The floor shows rather more than the fitted view; the ceiling is set by the
 * Moon, which needs a good deal of magnification before its exaggerated orbit
 * separates cleanly from Earth.
 */
export const MIN_ZOOM = 0.4;

/**
 * How far in the wheel may go, which depends on what the scale is doing.
 *
 * Compressed, the Moon's orbit is already exaggerated to 0.03 of the map radius
 * and twenty times is plenty to inspect it. **True scale needs far more.** There
 * the Moon sits 0.000147 of the map radius from Earth — a twentieth of a pixel —
 * so a ceiling of twenty tops out at under a pixel of separation and the lunar
 * orbit can never be seen at all, which rather defeats the honest view.
 *
 * A thousand puts it around thirty pixels across, which is the point of being
 * able to look.
 */
export const MAX_ZOOM = 20;
export const MAX_ZOOM_TRUE_SCALE = 1000;

export const maxZoomFor = (scaleMode: ScaleMode): number =>
  scaleMode === 'true' ? MAX_ZOOM_TRUE_SCALE : MAX_ZOOM;

/** Closest rung to an arbitrary rate, for stepping from an off-ladder value. */
function nearestRung(rate: number): number {
  let best = 0;
  for (let i = 1; i < RATE_LADDER.length; i++) {
    if (Math.abs(RATE_LADDER[i]! - rate) < Math.abs(RATE_LADDER[best]! - rate)) best = i;
  }
  return best;
}

export interface State {
  mode: ModeId;
  engineId: EngineId;
  /**
   * Second model drawn faintly for comparison, `'all'` for every rival model at
   * once, or null. See `COMPARISON_ENGINES`.
   */
  ghostEngineId: GhostSelection;
  frameOrigin: BodyId;
  observationPoint: BodyId;
  selectedBody: BodyId | null;
  zodiacScheme: ZodiacScheme;
  sphereCentre: SphereCentre;
  scaleMode: ScaleMode;
  /** Magnification of the map, 1 being the fitted view. */
  zoom: number;
  /**
   * How far the view has been dragged from the stationary point, in map-radius
   * units — the same units every position is expressed in, *not* pixels.
   *
   * Units rather than pixels so that zooming keeps whatever is at the middle of
   * the screen in the middle of the screen. A body renders at
   * `centre + (p + pan) · unit`, so the world point that stays put under a zoom
   * is `−pan` regardless of the magnification. At pan zero that point is the
   * frame origin, which is the behaviour the wheel zoom was built around.
   */
  panX: number;
  panY: number;
  showOrbits: boolean;
  showSightLines: boolean;
  showStarFigures: boolean;
  /** Draw the selected body's deferent, epicycle and equant. */
  showConstruction: boolean;
  /**
   * The longitude-against-time strip along the top of the stage.
   *
   * Off by default: it is the observer's record rather than the map, and a
   * reader meeting the app for the first time should meet the map.
   */
  showTrack: boolean;
  /**
   * The band of sky around the selected body, along the bottom of the stage.
   *
   * Off by default like the strip above it, and for the same reason: it answers
   * the observer's question rather than the model's, and belongs to a reader
   * who has already got their bearings on the map.
   */
  showSky: boolean;
  /**
   * How wide that band is, degrees of longitude.
   *
   * Three steps rather than a slider. Forty degrees is more than a constellation
   * and is where a planet's progress against the stars reads; twelve is a good
   * look at a close pairing; four is what it takes to see a conjunction actually
   * separate, since the closest of them are a fifth of a degree apart.
   */
  skyField: number;
  locale: Locale;
  theme: ThemeId;
  /** The calculation and demonstrations overlay, opened on demand. */
  showCalculation: boolean;
  /** The first-run welcome, shown until dismissed once. */
  showWelcome: boolean;
  /** Whether the controls' explanatory prose is shown. */
  showNotes: boolean;
  /** Mirrors the clock so subscribers see time changes like any other change. */
  julianDate: number;
  playing: boolean;
  rateDaysPerSecond: number;
}

type Listener = (state: State) => void;

export class Store {
  readonly clock: SimulationClock;
  /** Where the bodies have been. Orbits are drawn from this, not predicted. */
  readonly trails = new TrailLog();
  private state: State;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.clock = new SimulationClock(jdFromDate(new Date()), 1);

    // The canonical centre and vantage of the opening mode. They seed the state
    // and are never applied again: switching models afterwards leaves both
    // alone, so a comparison changes one thing at a time.
    const opening = MODES[INITIAL_MODE];

    this.state = {
      mode: INITIAL_MODE,
      engineId: opening.engines[0]!,
      ghostEngineId: null,
      frameOrigin: opening.defaultFrameOrigin,
      observationPoint: opening.defaultObservationPoint,
      selectedBody: null,
      zodiacScheme: 'signs',
      sphereCentre: 'frame',
      scaleMode: 'compressed',
      zoom: 1,
      panX: 0,
      panY: 0,
      showOrbits: true,
      showSightLines: true,
      showStarFigures: true,
      showConstruction: true,
      showTrack: false,
      showSky: false,
      skyField: 40,
      locale: getLocale(),
      theme: readStoredTheme(),
      showCalculation: false,
      showWelcome: !hasBeenWelcomed(),
      showNotes: readStoredNotes(),
      julianDate: this.clock.julianDate,
      playing: false,
      rateDaysPerSecond: 1,
    };
  }

  get(): Readonly<State> {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private patch(changes: Partial<State>): void {
    this.state = { ...this.state, ...changes };
    this.emit();
  }

  /**
   * Change model.
   *
   * Only the engine changes. The frame origin, the observation point, the date,
   * the selection and every view toggle survive, so switching models compares
   * like with like — which is the entire purpose of the app, and is undermined
   * the moment a switch quietly moves the centre as well.
   *
   * An earlier version snapped the frame origin to each mode's canonical centre,
   * on the grounds that a mode called "Ptolemy" ought to open Earth-centred.
   * That reasoning was wrong: it changed two things at once and so made it
   * impossible to tell the model's contribution from the frame's. The canonical
   * centres now seed the *initial* state only, and the frame picker is the one
   * place the centre moves.
   */
  setMode(mode: ModeId): void {
    const engineId = MODES[mode].engines[0]!;
    const ghost = this.state.ghostEngineId === engineId ? null : this.state.ghostEngineId;
    // A trail records one model's history; carrying it into another would
    // attribute positions to an engine that never produced them.
    this.trails.reset();
    this.patch({ mode, engineId, ghostEngineId: ghost });
  }

  /**
   * Apply a shared configuration.
   *
   * One patch rather than a run of setters, so a link produces a single render
   * and cannot pass through incoherent half-states on the way — setMode would
   * otherwise reset the engine that the very next call was about to set.
   *
   * The engine is reconciled with the mode here rather than trusted: the URL
   * layer validates the pair, but this method is also the one a future
   * deep-link or preset would go through, and a mode showing an engine it does
   * not own would leave the controls contradicting the map.
   */
  hydrate(incoming: Partial<HydratableState>): void {
    const mode = incoming.mode ?? this.state.mode;
    const allowed = MODES[mode].engines;
    const requested = incoming.engineId ?? this.state.engineId;
    const engineId = allowed.includes(requested) ? requested : allowed[0]!;

    const ghost = this.state.ghostEngineId === engineId ? null : this.state.ghostEngineId;

    // The clock is the authority on time, so move it rather than only the
    // mirrored field — patching `julianDate` alone would leave the two
    // disagreeing until the next tick quietly undid the jump.
    if (incoming.julianDate !== undefined) {
      this.clock.setJd(clampJd(incoming.julianDate));
    }

    this.trails.reset();
    this.patch({
      mode,
      engineId,
      ghostEngineId: ghost,
      frameOrigin: incoming.frameOrigin ?? this.state.frameOrigin,
      observationPoint: incoming.observationPoint ?? this.state.observationPoint,
      sphereCentre: incoming.sphereCentre ?? this.state.sphereCentre,
      julianDate: this.clock.julianDate,
    });
  }

  setEngine(engineId: EngineId): void {
    const ghost = this.state.ghostEngineId === engineId ? null : this.state.ghostEngineId;
    this.trails.reset();
    this.patch({ engineId, ghostEngineId: ghost });
  }

  clearTrails(): void {
    this.trails.reset();
    this.emit();
  }

  setGhostEngine(engineId: GhostSelection): void {
    this.patch({ ghostEngineId: engineId === this.state.engineId ? null : engineId });
  }

  /**
   * Recentre the map. The trail survives: whole snapshots are logged, so the
   * recorded history simply reprojects about the new origin — the same past,
   * seen from a different chair.
   *
   * The pan resets, so choosing a new stationary point actually centres on it.
   * Keeping the drag would be the literal reading of "hold that body still" and
   * the wrong one: the user asked to look at Mars, and leaving Mars off the edge
   * of the screen because of where they had dragged earlier is not that.
   */
  setFrameOrigin(frameOrigin: BodyId): void {
    this.trails.invalidateProjection();
    this.patch({ frameOrigin, panX: 0, panY: 0 });
  }

  /**
   * Put a given map point in the middle of the screen.
   *
   * A body renders at `centre + (p + pan) · unit`, so centring the point `p`
   * means a pan of exactly `−p`, at any magnification. Absolute rather than
   * relative because the caller knows where it wants to be, not how far it is
   * from where it happens to be.
   */
  panTo(x: number, y: number): void {
    this.patch({ panX: -x, panY: -y });
  }

  /** Drag the view. Offsets are in map-radius units, as `panX` documents. */
  panBy(dx: number, dy: number): void {
    this.patch({ panX: this.state.panX + dx, panY: this.state.panY + dy });
  }

  setObservationPoint(observationPoint: BodyId): void {
    this.patch({ observationPoint });
  }

  selectBody(selectedBody: BodyId | null): void {
    this.patch({ selectedBody });
  }

  setZodiacScheme(zodiacScheme: ZodiacScheme): void {
    this.patch({ zodiacScheme });
  }

  setSphereCentre(sphereCentre: SphereCentre): void {
    this.patch({ sphereCentre });
  }

  setScaleMode(scaleMode: ScaleMode): void {
    this.trails.invalidateProjection();
    // Leaving true scale drops the ceiling from a thousand to twenty, so a deep
    // lunar zoom has to come back with it or the compressed view opens somewhere
    // absurd.
    this.patch({
      scaleMode,
      zoom: Math.min(this.state.zoom, maxZoomFor(scaleMode)),
    });
  }

  /**
   * Magnify about the stationary point.
   *
   * Zoom needs no centre of its own: the frame origin is already at the middle
   * of the instrument, and every element is positioned in units of the map
   * radius, so scaling that unit magnifies about the origin by construction.
   * Nothing is reprojected and no trail is recomputed — the same numbers are
   * simply drawn larger.
   */
  zoomBy(factor: number): void {
    this.setZoom(this.state.zoom * factor);
  }

  setZoom(zoom: number): void {
    const clamped = Math.min(maxZoomFor(this.state.scaleMode), Math.max(MIN_ZOOM, zoom));
    if (clamped === this.state.zoom) return;
    this.patch({ zoom: clamped });
  }

  /** Back to the fitted, centred view — the way out of both a zoom and a drag. */
  resetZoom(): void {
    this.patch({
      zoom: 1,
      panX: 0,
      panY: 0,
    });
  }

  toggle(
    key:
      | 'showOrbits'
      | 'showSightLines'
      | 'showStarFigures'
      | 'showConstruction'
      | 'showTrack'
      | 'showSky',
  ): void {
    this.patch({ [key]: !this.state[key] } as Partial<State>);
  }

  /** Widen or narrow the band of sky. See `skyField`. */
  setSkyField(skyField: number): void {
    if (skyField === this.state.skyField) return;
    this.patch({ skyField });
  }

  setCalculationOpen(showCalculation: boolean): void {
    if (showCalculation === this.state.showCalculation) return;
    this.patch({ showCalculation });
  }

  /** Dismissing the welcome is permanent; this browser has now seen it. */
  dismissWelcome(): void {
    rememberWelcome();
    this.patch({ showWelcome: false });
  }

  toggleNotes(): void {
    const showNotes = !this.state.showNotes;
    applyNotes(showNotes);
    this.patch({ showNotes });
  }

  /**
   * Jump to a decisive observation.
   *
   * Unlike `setMode`, this deliberately *does* move the centre and the vantage.
   * The rule that a model switch changes one thing at a time exists so that a
   * comparison stays honest; a demonstration is the opposite errand — it sets up
   * a whole scene at once, and the point is the scene rather than the isolation.
   *
   * Playback stops. These are moments to look at, and arriving at one already
   * drifting away from it would be perverse.
   */
  applyDemonstration(demonstration: Demonstration): void {
    this.clock.setJd(clampJd(demonstration.jd));
    this.clock.pause();
    this.trails.reset();

    this.patch({
      mode: demonstration.mode,
      engineId: MODES[demonstration.mode].engines[0]!,
      ghostEngineId: null,
      frameOrigin: demonstration.frameOrigin,
      observationPoint: demonstration.observationPoint,
      selectedBody: demonstration.body,
      julianDate: this.clock.julianDate,
      playing: false,
    });
  }

  setLocale(locale: Locale): void {
    setLocale(locale);
    this.patch({ locale });
  }

  setTheme(theme: ThemeId): void {
    applyTheme(theme);
    this.patch({ theme });
  }

  // --- time -------------------------------------------------------------

  /**
   * Jump to a date. The trail is discarded, because the bodies did not travel
   * from where they were to where they now are — a line joining the two would
   * be a path nothing ever took.
   */
  setJulianDate(jd: number): void {
    this.clock.setJd(jd);
    this.trails.reset();
    this.patch({ julianDate: this.clock.julianDate });
  }

  /** Nudge the clock. Small and continuous, so the trail keeps building. */
  stepDays(days: number): void {
    this.clock.step(days);
    this.recordTrail();
    this.patch({ julianDate: this.clock.julianDate });
  }

  setRate(rateDaysPerSecond: number): void {
    this.clock.setRate(rateDaysPerSecond);
    this.patch({ rateDaysPerSecond });
  }

  /**
   * Step along the rate ladder.
   *
   * Rates span a factor of 1600, so a linear control would be useless: the
   * ladder is roughly geometric and the buttons move one rung. Clamped at both
   * ends rather than wrapping, so holding the button down cannot silently take
   * you from a crawl to four centuries a minute.
   */
  stepRate(direction: -1 | 1): void {
    const current = RATE_LADDER.indexOf(this.state.rateDaysPerSecond);
    const from = current === -1 ? nearestRung(this.state.rateDaysPerSecond) : current;
    const next = Math.min(RATE_LADDER.length - 1, Math.max(0, from + direction));
    this.setRate(RATE_LADDER[next]!);
  }

  get canSpeedUp(): boolean {
    return this.state.rateDaysPerSecond < RATE_LADDER[RATE_LADDER.length - 1]!;
  }

  get canSlowDown(): boolean {
    return this.state.rateDaysPerSecond > RATE_LADDER[0]!;
  }

  play(): void {
    this.clock.play();
    this.patch({ playing: true });
  }

  pause(): void {
    this.clock.pause();
    this.patch({ playing: false });
  }

  togglePlay(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  /**
   * Advance the clock by elapsed real time. Called from the animation loop.
   *
   * Pauses on reaching either end of the supported range. The clock clamps
   * there anyway, so without this the app sat apparently frozen — nothing
   * moving, no trail growing — while the transport still read "Pause" and
   * invited the user to stop something that had already stopped.
   */
  tick(realSeconds: number): void {
    if (!this.state.playing) return;
    this.clock.advance(realSeconds);
    this.recordTrail();

    // Stop *and* publish the clamped date in one patch. Returning early instead
    // would leave the mirrored `julianDate` a step behind the clock, which is
    // the same desync `hydrate` goes out of its way to avoid.
    const atEnd = this.clock.julianDate <= MIN_JD || this.clock.julianDate >= MAX_JD;
    if (atEnd) this.clock.pause();

    this.patch({
      julianDate: this.clock.julianDate,
      ...(atEnd ? { playing: false } : {}),
    });
  }

  /**
   * Offer the current positions to the log.
   *
   * The engine is evaluated here rather than in the renderer so that history is
   * recorded even when nothing is drawn — trails switched off, or the tab in
   * the background — and the record stays continuous either way.
   */
  private recordTrail(): void {
    const jd = this.clock.julianDate;
    // Ask before computing. This runs on every tick, and evaluating an engine
    // to hand the log a sample it will discard is the most expensive thing the
    // clock could do sixty times a second.
    if (!this.trails.wants(jd)) return;

    this.trails.record(jd, ENGINES[this.state.engineId].positionsAt(jd));
  }

  jumpToDate(date: Date): void {
    this.setJulianDate(clampJd(jdFromDate(date)));
  }

  // --- derived ----------------------------------------------------------

  get engine(): Engine {
    return ENGINES[this.state.engineId];
  }

  get ghostEngine(): Engine | null {
    const { ghostEngineId } = this.state;
    return ghostEngineId && ghostEngineId !== 'all' ? ENGINES[ghostEngineId] : null;
  }
}

export const store = new Store();
