import { useEffect, useMemo, useState } from 'react'
import type { GameState } from '../../../shared/contract/types'
import type { DraftPickPayload, DraftStageKind, DraftState } from '../../../shared/draft/types'
import type { Locale } from '../../../shared/i18n'
import { DraftPoolRow } from './DraftPoolRow'
import { DraftHistoryPanel } from './DraftHistoryPanel'

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

  let submittedCount = 0
  for (const pid of draft.seatOrder) {
    const p = draft.pendingPicks[pid]
    if (
      p &&
      (stage === 'standard'
        ? p.occ !== null && p.minor !== null
        : stage === 'occupation'
          ? p.occ !== null
          : p.minor !== null)
    ) submittedCount += 1
  }

  return {
    stage,
    round: draft.round,
    totalRounds: draft.totalRounds,
    seatCount: draft.seatOrder.length,
    submittedCount,
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
  const promptText =
    vm.stage === 'occupation'
      ? 'Pick 1 occupation, then confirm.'
      : vm.stage === 'farmersOfTheMoorMinor'
        ? 'Pick 1 Farmers of the Moor minor improvement, then confirm.'
        : vm.stage === 'publishedMinor'
          ? 'Pick 1 minor improvement, then confirm.'
          : 'Pick 1 occupation + 1 minor improvement, then confirm.'

  return (
    <div className="draft-overlay" role="dialog" aria-label="Card draft">
      <div className="draft-overlay-panel">
        <header className="draft-overlay-header">
          <h2 className="draft-overlay-title">
            Draft — Round {vm.round} / {vm.totalRounds}
          </h2>
          <div className="draft-overlay-status" data-already-submitted={vm.alreadySubmitted ? '1' : '0'}>
            {vm.alreadySubmitted
              ? `Waiting for other players (${vm.submittedCount}/${vm.seatCount})…`
              : promptText}
          </div>
        </header>

        {!vm.alreadySubmitted && (
          <>
            {showOccupations && (
              <section className="draft-section" data-section="occ">
                <h3 className="draft-section-title">Occupations</h3>
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
                <h3 className="draft-section-title">Minor improvements</h3>
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
                Confirm picks
              </button>
            </div>
          </>
        )}

        <section className="draft-section draft-section-kept">
          <h3 className="draft-section-title">Already kept</h3>
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
