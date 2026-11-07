import { useState } from 'react'
import type { GameState } from '../../../shared/contract/types'
import type { DraftPickPayload, DraftState } from '../../../shared/draft/types'
import { draftSeatProgress } from '../../../shared/projections/draft-progress'
import { t, type Locale } from '../../../shared/i18n'
import { DraftPoolRow } from './DraftPoolRow'
import { DraftHistoryPanel } from './DraftHistoryPanel'
import { getPlayerDisplayName } from '../../utils/player-name'

type Props = {
  state: GameState
  meId: string
  locale: Locale
  connectedPlayerIndexes?: number[] | null
  onSubmit: (pick: DraftPickPayload) => void | Promise<void>
}

export function computeDraftViewModel(draft: DraftState, meId: string | null) {
  const progress = draftSeatProgress(draft, meId ?? '')
  return {
    progress,
    stage: progress.kind === 'finished' ? 'standard' : progress.stage,
    round: progress.kind === 'finished' ? 0 : progress.round,
    totalRounds: progress.kind === 'finished' ? 0 : progress.totalRounds,
    myPool: progress.kind === 'selecting' ? progress.pool : { occ: [], minor: [] },
    myKept: progress.kept,
    alreadySubmitted: progress.kind !== 'selecting',
    waitingPlayerIds: draft.seatOrder.filter(id => draftSeatProgress(draft, id).kind === 'selecting'),
  }
}
export type DraftViewModel = ReturnType<typeof computeDraftViewModel>

export function canSubmitPick(vm: DraftViewModel, occ: string | null, minor: string | null): boolean {
  if (vm.progress.kind !== 'selecting') return false
  if (vm.stage !== 'occupation' && (!minor || !vm.myPool.minor.includes(minor))) return false
  if ((vm.stage === 'standard' || vm.stage === 'occupation') && (!occ || !vm.myPool.occ.includes(occ))) return false
  return true
}

export function DraftPlayersProgress({ state, locale, meId, connectedPlayerIndexes }: {
  state: GameState; locale: Locale; meId?: string; connectedPlayerIndexes?: number[] | null
}) {
  const draft = state.draft
  if (!draft) return null
  return <section className="draft-opening-order" aria-label={t(locale, 'ui.openingOrder')}>
    <h3 className="draft-section-title">{t(locale, 'ui.openingOrder')}</h3>
    <ol className="draft-opening-players">
      {state.players.map((player, index) => {
        const progress = draftSeatProgress(draft, player.id)
        const status = progress.kind === 'selecting' ? 'ui.draft.selecting'
          : progress.kind === 'waiting' ? 'ui.draft.waitingForPacket' : 'ui.draft.complete'
        return <li key={player.id} className="draft-opening-player" data-player-id={player.id}
          data-is-you={player.id === meId ? 'true' : 'false'} data-status={progress.kind}>
          <span className="draft-opening-rank">{index + 1}</span>
          <span className="draft-opening-color" role="img" aria-label={t(locale, `platform.playerColors.${player.color}`)} style={{ backgroundColor: player.color }} />
          <span className="draft-opening-name">{getPlayerDisplayName(locale, player.name, index, player.nameIsDefault)}</span>
          <span className="draft-opening-details">
            {player.id === meId && <span className="draft-opening-badge">{t(locale, 'ui.you')}</span>}
            {player.startPlayer && <span className="draft-opening-badge">{t(locale, 'ui.startPlayer')}</span>}
            <span className="draft-opening-selection" data-status={progress.kind}>{t(locale, status)}</span>
            <span className="draft-opening-progress">{t(locale, 'ui.draft.progress', {
              occ: progress.kept.occ.length, occTotal: progress.targets.occ,
              minor: progress.kept.minor.length, minorTotal: progress.targets.minor,
            })}</span>
            {connectedPlayerIndexes && <span className="draft-opening-presence" data-connected={connectedPlayerIndexes.includes(index)}>
              {t(locale, connectedPlayerIndexes.includes(index) ? 'ui.draft.online' : 'ui.draft.offline')}
            </span>}
          </span>
        </li>
      })}
    </ol>
  </section>
}

export function DraftOverlay(props: Props) {
  const { state, meId } = props
  if (state.phase !== 'draft' || !state.draft) return null
  const progress = draftSeatProgress(state.draft, meId)
  const inputKey = progress.kind === 'selecting' ? progress.opportunityKey : progress.kind
  return <DraftSelection key={`${meId}:${inputKey}`} {...props} draft={state.draft} />
}

function DraftSelection({ state, meId, locale, onSubmit, connectedPlayerIndexes, draft }: Props & { draft: DraftState }) {
  const [selOcc, setSelOcc] = useState<string | null>(null)
  const [selMinor, setSelMinor] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const vm = computeDraftViewModel(draft, meId)
  const canSubmit = !submitting && canSubmitPick(vm, selOcc, selMinor)
  const handleConfirm = async () => {
    if (!canSubmit || vm.progress.kind !== 'selecting') return
    const pick: DraftPickPayload = {
      opportunityKey: vm.progress.opportunityKey,
      ...(vm.stage === 'standard' || vm.stage === 'occupation' ? { occCardId: selOcc ?? undefined } : {}),
      ...(vm.stage !== 'occupation' ? { minorCardId: selMinor ?? undefined } : {}),
    }
    setSubmitting(true)
    try { await onSubmit(pick) } finally { setSubmitting(false) }
  }
  const showOccupations = vm.stage === 'standard' || vm.stage === 'occupation'
  return <div className="draft-overlay" role="dialog" aria-label={t(locale, 'ui.draft.dialog')}>
    <div className="draft-overlay-panel">
      <header className="draft-overlay-header">
        <h2 className="draft-overlay-title">{vm.progress.kind === 'finished' ? t(locale, 'ui.draft.heading')
          : t(locale, 'ui.draft.title', { round: vm.round, total: vm.totalRounds })}</h2>
        <div className="draft-overlay-status" data-already-submitted={vm.alreadySubmitted ? '1' : '0'}>
          {vm.progress.kind === 'selecting' ? t(locale, `ui.draft.prompt.${vm.stage}`)
            : t(locale, vm.progress.kind === 'finished' ? 'ui.draft.complete' : 'ui.draft.waitingForPacket')}
        </div>
      </header>
      <DraftPlayersProgress state={state} meId={meId} locale={locale} connectedPlayerIndexes={connectedPlayerIndexes} />
      {vm.alreadySubmitted && vm.waitingPlayerIds.length > 0 && <p className="draft-opening-hint" role="status">
        {t(locale, 'ui.draft.waitingForPlayers', { players: vm.waitingPlayerIds.map(id => {
          const index = state.players.findIndex(player => player.id === id)
          const player = state.players[index]
          return getPlayerDisplayName(locale, player?.name, index, player?.nameIsDefault)
        }).join(' · ') })}
      </p>}
      {state.enableSnakeOpening && <p className="draft-opening-hint">{t(locale, 'ui.snakeOpening')} · {t(locale, 'ui.snakeOpeningDescription')}</p>}
      {vm.progress.kind === 'selecting' && <>
        {showOccupations && <section className="draft-section" data-section="occ">
          <h3 className="draft-section-title">{t(locale, 'ui.draft.occupations')}</h3>
          <DraftPoolRow kind="occ" ids={vm.myPool.occ} selectedId={selOcc} onSelect={setSelOcc} locale={locale} />
        </section>}
        {vm.stage !== 'occupation' && <section className="draft-section" data-section="minor">
          <h3 className="draft-section-title">{t(locale, 'ui.draft.minorImprovements')}</h3>
          <DraftPoolRow kind="minor" ids={vm.myPool.minor} selectedId={selMinor} onSelect={setSelMinor} locale={locale} />
        </section>}
        <div className="draft-actions"><button type="button" className="btn-primary draft-confirm-btn" disabled={!canSubmit} onClick={() => { void handleConfirm() }}>
          {t(locale, 'ui.draft.confirm')}
        </button></div>
      </>}
      <section className="draft-section draft-section-kept">
        <h3 className="draft-section-title">{t(locale, 'ui.draft.kept')}</h3>
        <DraftHistoryPanel occIds={vm.myKept.occ} minorIds={vm.myKept.minor} locale={locale} />
      </section>
    </div>
  </div>
}
