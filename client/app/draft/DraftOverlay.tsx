import { useEffect, useMemo, useState } from 'react'
import type { GameState } from '../../../shared/contract/types'
import type { DraftPickPayload, DraftStageKind, DraftState } from '../../../shared/draft/types'
import { t, type Locale } from '../../../shared/i18n'
import { DraftPoolRow } from './DraftPoolRow'
import { DraftHistoryPanel } from './DraftHistoryPanel'
import { getPlayerDisplayName } from '../../utils/player-name'

interface Props {
  state: GameState
  meId: string
  locale: Locale
  onSubmit: (pick: DraftPickPayload) => void | Promise<void>
}

/**
 * Pure helper extracted for unit testing — no React state, no DOM.
 *
 * Returns the derived view-model used to drive the overlay: my pool / kept /
 * pending picks, how many players have already submitted, and whether I am
 * currently waiting.
 */
export interface DraftViewModel {
  stage: DraftStageKind
  round: number
  totalRounds: number
  seatCount: number
  submittedCount: number
  submittedPlayerIds: string[]
  waitingPlayerIds: string[]
  myPool: { occ: string[]; minor: string[] }
  myKept: { occ: string[]; minor: string[] }
  myPending: { occ: string | null; minor: string | null }
  alreadySubmitted: boolean
}

export function computeDraftViewModel(draft: DraftState, meId: string): DraftViewModel {
  const stage = draft.stage ?? 'standard'
  const myPool = draft.pools[meId] ?? { occ: [], minor: [] }
  const myKept = draft.kept[meId] ?? { occ: [], minor: [] }
  const myPending = draft.pendingPicks[meId] ?? { occ: null, minor: null }

  const alreadySubmitted =
    stage === 'standard'
      ? myPending.occ !== null && myPending.minor !== null
      : stage === 'occupation'
        ? myPending.occ !== null
        : myPending.minor !== null

  const submittedPlayerIds: string[] = []
  for (const pid of draft.seatOrder) {
    const p = draft.pendingPicks[pid]
    if (
      p &&
      (stage === 'standard'
        ? p.occ !== null && p.minor !== null
        : stage === 'occupation'
          ? p.occ !== null
          : p.minor !== null)
    ) submittedPlayerIds.push(pid)
  }

  return {
    stage,
    round: draft.round,
    totalRounds: draft.totalRounds,
    seatCount: draft.seatOrder.length,
    submittedCount: submittedPlayerIds.length,
    submittedPlayerIds,
    waitingPlayerIds: draft.seatOrder.filter(pid => !submittedPlayerIds.includes(pid)),
    myPool,
    myKept,
    myPending,
    alreadySubmitted,
  }
}

export function canSubmitPick(
  vm: DraftViewModel,
  selOcc: string | null,
  selMinor: string | null,
): boolean {
  if (vm.alreadySubmitted) return false
  if (vm.stage === 'occupation') {
    return selOcc !== null && vm.myPool.occ.includes(selOcc)
  }
  if (vm.stage === 'farmersOfTheMoorMinor' || vm.stage === 'publishedMinor') {
    return selMinor !== null && vm.myPool.minor.includes(selMinor)
  }
  return (
    selOcc !== null &&
    selMinor !== null &&
    vm.myPool.occ.includes(selOcc) &&
    vm.myPool.minor.includes(selMinor)
  )
}

/**
 * Covers the whole game board while `state.phase === 'draft'`. Only the local
 * player's view is rendered; server serialization masks other players' picks.
 */
export function DraftOverlay({ state, meId, locale, onSubmit }: Props) {
  if (state.phase !== 'draft' || !state.draft) return null
  const draft = state.draft

  const [selOcc, setSelOcc] = useState<string | null>(null)
  const [selMinor, setSelMinor] = useState<string | null>(null)

  // Reset local selections when a new round begins (round advances or first entry).
  useEffect(() => {
    setSelOcc(null)
    setSelMinor(null)
  }, [draft.round, draft.stage])

  const vm = useMemo(() => computeDraftViewModel(draft, meId), [draft, meId])
  const canSubmit = canSubmitPick(vm, selOcc, selMinor)

  const handleConfirm = () => {
    if (!canSubmit) return
    if (vm.stage === 'occupation' && selOcc !== null) {
      void onSubmit({ occCardId: selOcc })
      return
    }
    if ((vm.stage === 'farmersOfTheMoorMinor' || vm.stage === 'publishedMinor') && selMinor !== null) {
      void onSubmit({ minorCardId: selMinor })
      return
    }
    if (selOcc !== null && selMinor !== null) {
      void onSubmit({ occCardId: selOcc, minorCardId: selMinor })
    }
  }

  const showOccupations = vm.stage === 'standard' || vm.stage === 'occupation'
  const showMinors = vm.stage === 'standard' || vm.stage === 'farmersOfTheMoorMinor' || vm.stage === 'publishedMinor'
  const promptText = t(locale, `ui.draft.prompt.${vm.stage}`)

  return (
    <div className="draft-overlay" role="dialog" aria-label={t(locale, 'ui.draft.dialog')}>
      <div className="draft-overlay-panel">
        <header className="draft-overlay-header">
          <h2 className="draft-overlay-title">
            {t(locale, 'ui.draft.title', { round: vm.round, total: vm.totalRounds })}
          </h2>
          <div className="draft-overlay-status" data-already-submitted={vm.alreadySubmitted ? '1' : '0'}>
            {vm.alreadySubmitted
              ? t(locale, 'ui.draft.waitingForOthers', { submitted: vm.submittedCount, seats: vm.seatCount })
              : promptText}
          </div>
        </header>

        <section className="draft-opening-order" aria-label={t(locale, 'ui.openingOrder')}>
          <h3 className="draft-section-title">{t(locale, 'ui.openingOrder')}</h3>
          <ol className="draft-opening-players">
            {state.players.map((player, index) => (
              <li key={player.id} className="draft-opening-player" data-player-id={player.id}
                data-is-you={player.id === meId ? 'true' : 'false'}>
                <span className="draft-opening-rank">{index + 1}</span>
                <span className="draft-opening-color" role="img" aria-label={t(locale, `platform.playerColors.${player.color}`)}
                  style={{ backgroundColor: player.color }} />
                <span className="draft-opening-name">{getPlayerDisplayName(locale, player.name, index, player.nameIsDefault)}</span>
                <span className="draft-opening-details">
                  {player.id === meId && <span className="draft-opening-badge">{t(locale, 'ui.you')}</span>}
                  {player.startPlayer && <span className="draft-opening-badge">{t(locale, 'ui.startPlayer')}</span>}
                  <span className="draft-opening-selection" data-submitted={vm.submittedPlayerIds.includes(player.id) ? 'true' : 'false'}>
                    {t(locale, vm.submittedPlayerIds.includes(player.id) ? 'ui.draft.submitted' : 'ui.draft.selecting')}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {vm.alreadySubmitted && <p className="draft-opening-hint" role="status">
            {t(locale, 'ui.draft.waitingForPlayers', { players: vm.waitingPlayerIds.map(id => {
              const index = state.players.findIndex(player => player.id === id)
              const player = state.players[index]
              return getPlayerDisplayName(locale, player?.name, index, player?.nameIsDefault)
            }).join(' · ') })}
          </p>}
          {state.enableSnakeOpening && <p className="draft-opening-hint">{t(locale, 'ui.snakeOpening')} · {t(locale, 'ui.snakeOpeningDescription')}</p>}
        </section>

        {!vm.alreadySubmitted && (
          <>
            {showOccupations && (
              <section className="draft-section" data-section="occ">
                <h3 className="draft-section-title">{t(locale, 'ui.draft.occupations')}</h3>
                <DraftPoolRow
                  kind="occ"
                  ids={vm.myPool.occ}
                  selectedId={selOcc}
                  onSelect={setSelOcc}
                  locale={locale}
                />
              </section>
            )}
            {showMinors && (
              <section className="draft-section" data-section="minor">
                <h3 className="draft-section-title">{t(locale, 'ui.draft.minorImprovements')}</h3>
                <DraftPoolRow
                  kind="minor"
                  ids={vm.myPool.minor}
                  selectedId={selMinor}
                  onSelect={setSelMinor}
                  locale={locale}
                />
              </section>
            )}
            <div className="draft-actions">
              <button
                type="button"
                className="btn-primary draft-confirm-btn"
                disabled={!canSubmit}
                onClick={handleConfirm}
              >
                {t(locale, 'ui.draft.confirm')}
              </button>
            </div>
          </>
        )}

        <section className="draft-section draft-section-kept">
          <h3 className="draft-section-title">{t(locale, 'ui.draft.kept')}</h3>
          <DraftHistoryPanel
            occIds={vm.myKept.occ}
            minorIds={vm.myKept.minor}
            locale={locale}
          />
        </section>
      </div>
    </div>
  )
}
