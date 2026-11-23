/**
 * Model Capability Scorecard — side-by-side matrix of what all four models
 * predict (and cannot predict) for the selected body at this instant.
 *
 * Directly dramatizes both halves of the core argument: near-agreement in
 * longitude beside sharp breaks in phase (Venus/Mercury), absolute scale (AU
 * vs Ptolemy's parts of 60), ecliptic latitude, and physical forces.
 */

import type { BodyId } from '@orrery/core/bodies';
import { relativePosition } from '@orrery/core/coordinates';
import { inDeferentParts } from '@orrery/core/engines/ptolemaicUnits';
import { ENGINES, REFERENCE_ENGINE_ID } from '@orrery/core/engines/registry';
import type { EngineId, ModeId } from '@orrery/core/engines/types';
import { illuminationOf, type Illumination } from '@orrery/core/illumination';
import { angleDiffDeg } from '@orrery/core/vec';
import { locate, type ZodiacPosition } from '@orrery/core/zodiac';
import { bodyName, formatExponent, formatNumber, t } from '../../i18n/i18n';
import type { State, Store } from '../../state/store';
import { el, note } from '../../ui/dom';

export interface ScorecardColumn {
  mode: ModeId;
  engineId: EngineId;
  zodiac: ZodiacPosition;
  longitudeErrorDeg: number;
  latitudeDeg: number;
  flatLatitude: boolean;
  illumination: Illumination;
  /** True when Ptolemy's nested-sphere cap visibly conflicts with heliocentric phase. */
  phaseCapped: boolean;
  phaseCapPercent: number | null;
  distanceAu: number;
  deferentParts: number | null;
  netForceNewtons: number | null;
}

const SCORECARD_MODELS: readonly { mode: ModeId; engineId: EngineId }[] = [
  { mode: 'ptolemy', engineId: 'ptolemaic-epicyclic' },
  { mode: 'copernicus', engineId: 'copernican' },
  { mode: 'kepler', engineId: 'keplerian' },
  { mode: 'newton', engineId: 'nbody' },
];

/** Compute the four-model capability snapshot purely, for rendering and tests. */
export function buildScorecard(state: State): { body: BodyId; columns: ScorecardColumn[] } | null {
  const body = state.selectedBody;
  if (!body || body === state.observationPoint) return null;

  const refPositions = ENGINES[REFERENCE_ENGINE_ID].positionsAt(state.julianDate);
  const refRel = relativePosition(refPositions, state.observationPoint, body);
  const keplerIllum = illuminationOf(
    ENGINES.keplerian.positionsAt(state.julianDate),
    state.observationPoint,
    body,
  ).illuminatedFraction;

  const columns: ScorecardColumn[] = SCORECARD_MODELS.map(({ mode, engineId }) => {
    const positions = ENGINES[engineId].positionsAt(state.julianDate);
    const rel = relativePosition(positions, state.observationPoint, body);
    const illumination = illuminationOf(positions, state.observationPoint, body);
    const isPtolemy = mode === 'ptolemy';
    const deferentParts = isPtolemy ? inDeferentParts(rel.distance, state.julianDate, body) : null;
    const phaseCapPercent =
      isPtolemy && body === 'venus' ? 44 : isPtolemy && body === 'mercury' ? 8 : null;
    const phaseCapped =
      phaseCapPercent !== null && keplerIllum - illumination.illuminatedFraction >= 0.2;
    const dynamics = ENGINES[engineId].dynamics?.(state.julianDate, body);

    return {
      mode,
      engineId,
      zodiac: locate(rel.longitude, state.julianDate, state.zodiacScheme),
      longitudeErrorDeg: Math.abs(angleDiffDeg(rel.longitude, refRel.longitude)),
      latitudeDeg: rel.latitude,
      flatLatitude: isPtolemy && Math.abs(rel.latitude) < 1e-9,
      illumination,
      phaseCapped,
      phaseCapPercent,
      distanceAu: rel.distance,
      deferentParts,
      netForceNewtons: dynamics?.netNewtons ?? null,
    };
  });

  return { body, columns };
}

function miniPhaseDisc(body: BodyId, illumination: Illumination): HTMLDivElement {
  const lit = illumination.illuminatedFraction;
  const disc = el('div', 'phase-disc phase-disc--mini');
  disc.style.setProperty('--tint', `var(--body-${body})`);
  disc.dataset.side = illumination.waxing ? 'right' : 'left';
  disc.dataset.shape = lit >= 0.5 ? 'gibbous' : 'crescent';
  disc.style.setProperty('--lit-width', Math.abs(2 * lit - 1).toFixed(4));
  disc.append(el('div', 'phase-disc__half'), el('div', 'phase-disc__terminator'));
  return disc;
}

export function renderScorecard(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const data = buildScorecard(state);
  if (!data) {
    container.appendChild(note(t('scorecard.selectPrompt'), 'note note--live scorecard__empty'));
    return;
  }

  const wrap = el('div', 'scorecard');
  wrap.appendChild(
    el('div', 'scorecard__title', t('scorecard.title', { body: bodyName(data.body) })),
  );

  const table = el('table', 'scorecard__table');
  const thead = el('thead');
  const headerRow = el('tr');
  headerRow.appendChild(el('th', 'scorecard__corner', ''));

  for (const col of data.columns) {
    const th = el('th');
    const active = state.mode === col.mode;
    const btn = el('button', 'scorecard__model-btn');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(active));
    const dot = el('span', 'chip__swatch');
    dot.style.setProperty('--tint', `var(--model-${col.mode})`);
    btn.append(dot, el('span', undefined, t(`mode.${col.mode}`)));
    btn.addEventListener('click', () => store.setMode(col.mode));
    th.appendChild(btn);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  const addRow = (label: string, renderCell: (col: ScorecardColumn) => HTMLElement): void => {
    const tr = el('tr');
    tr.appendChild(el('th', 'scorecard__row-label', label));
    for (const col of data.columns) {
      const td = el('td', state.mode === col.mode ? 'scorecard__cell--active' : undefined);
      td.appendChild(renderCell(col));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  };

  addRow(t('scorecard.row.longitude'), (col) => {
    const cell = el('div', 'scorecard__metric');
    cell.append(
      el(
        'span',
        'scorecard__primary',
        `${formatNumber(col.zodiac.degreesInto, 1)}° ${t(`zodiac.${col.zodiac.division.id}`)}`,
      ),
      el('span', 'scorecard__sub', `Δ ${formatNumber(col.longitudeErrorDeg, 2)}°`),
    );
    return cell;
  });

  if (data.body !== 'sun') {
    addRow(t('scorecard.row.phase'), (col) => {
      const cell = el('div', 'scorecard__phase');
      cell.append(
        miniPhaseDisc(data.body, col.illumination),
        el('span', 'scorecard__primary', `${formatNumber(col.illumination.illuminatedFraction * 100, 0)} %`),
      );
      if (col.phaseCapped && col.phaseCapPercent !== null) {
        cell.appendChild(
          el(
            'span',
            'scorecard__flag',
            t('scorecard.phaseForbidden', { max: formatNumber(col.phaseCapPercent, 0) }),
          ),
        );
      }
      return cell;
    });
  }

  addRow(t('scorecard.row.distance'), (col) => {
    const cell = el('div', 'scorecard__metric');
    if (col.deferentParts !== null) {
      cell.append(
        el('span', 'scorecard__primary', `${formatNumber(col.deferentParts, 1)} ${t('info.unit.parts')}`),
        el('span', 'scorecard__flag', t('info.noAbsoluteScale')),
      );
    } else {
      cell.appendChild(
        el('span', 'scorecard__primary', `${formatNumber(col.distanceAu, 3)} ${t('info.unit.au')}`),
      );
    }
    return cell;
  });

  addRow(t('scorecard.row.latitude'), (col) => {
    const cell = el('div', 'scorecard__metric');
    if (col.flatLatitude) {
      cell.appendChild(el('span', 'scorecard__flag', t('scorecard.flatLatitude')));
    } else {
      const sign = col.latitudeDeg >= 0 ? '+' : '−';
      cell.appendChild(
        el(
          'span',
          'scorecard__primary',
          `${sign}${formatNumber(Math.abs(col.latitudeDeg), 2)}${t('info.unit.deg')}`,
        ),
      );
    }
    return cell;
  });

  addRow(t('scorecard.row.cause'), (col) => {
    const cell = el('div', 'scorecard__metric');
    const text =
      col.mode === 'newton' && col.netForceNewtons !== null
        ? t('scorecard.cause.newton', { force: formatExponent(col.netForceNewtons) })
        : t(`scorecard.cause.${col.mode}`);
    cell.appendChild(el('span', 'scorecard__sub', text));
    return cell;
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);
}
