import { useEffect, useMemo, useState } from 'react'
import type { GameState } from '../../../shared/contract/types'
import type { DraftPickPayload, DraftState } from '../../../shared/draft/types'
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
  const myPool = draft.pools[meId] ?? { occ: [], minor: [] }
  const myKept = draft.kept[meId] ?? { occ: [], minor: [] }
  const myPending = draft.pendingPicks[meId] ?? { occ: null, minor: null }

  const alreadySubmitted = myPending.occ !== null && myPending.minor !== null

  let submittedCount = 0
  for (const pid of draft.seatOrder) {
    const p = draft.pendingPicks[pid]
    if (p && p.occ !== null && p.minor !== null) submittedCount += 1
  }

  return {
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
  if (selOcc === null || selMinor === null) return false
  // Selected ids must come from the current pool.
  if (!vm.myPool.occ.includes(selOcc)) return false
  if (!vm.myPool.minor.includes(selMinor)) return false
  return true
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
  }, [draft.round])

  const vm = useMemo(() => computeDraftViewModel(draft, meId), [draft, meId])
  const canSubmit = canSubmitPick(vm, selOcc, selMinor)

  const handleConfirm = () => {
    if (!canSubmit || selOcc === null || selMinor === null) return
    void onSubmit({ occCardId: selOcc, minorCardId: selMinor })
  }

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
              : 'Pick 1 occupation + 1 minor improvement, then confirm.'}
          </div>
        </header>

        {!vm.alreadySubmitted && (
          <>
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
