import { useMemo, useState } from 'react'
import type {
  GameState,
  ParentSelectionCandidates,
  ParentSelectionState,
  ParentSelectionSubmission,
} from '../../../shared/contract/types'
import type { Locale } from '../../../shared/i18n'
import type { FatherParentCardId, MotherParentCardId, ParentCardId } from '../../../shared/parents'
import { getParentCardDefinition } from '../../../shared/parents'
import { resolveParentCardAssetUrls } from '../../services/parent-assets'
import { DraftHistoryPanel } from '../draft/DraftHistoryPanel'

type VisibleParentId = ParentCardId | '?'

export interface ParentSelectionViewModel {
  seatCount: number
  submittedCount: number
  myCandidates: {
    mother: MotherParentCardId[]
    father: FatherParentCardId[]
  }
  alreadySubmitted: boolean
  canSeeCandidates: boolean
}

const isVisibleParentId = (id: unknown): id is ParentCardId =>
  typeof id === 'string' && id !== '?'

const visibleMotherIds = (ids: readonly VisibleParentId[] | undefined): MotherParentCardId[] =>
  (ids ?? []).filter(isVisibleParentId) as MotherParentCardId[]

const visibleFatherIds = (ids: readonly VisibleParentId[] | undefined): FatherParentCardId[] =>
  (ids ?? []).filter(isVisibleParentId) as FatherParentCardId[]

const visibleOrdinaryCardIds = (ids: readonly string[] | undefined): string[] =>
  (ids ?? []).filter((id) => id !== '?')

export function computeParentSelectionViewModel(
  parentSelection: ParentSelectionState,
  meId: string,
): ParentSelectionViewModel {
  const candidates = parentSelection.candidates[meId] as ParentSelectionCandidates | undefined
  const submission = parentSelection.submissions[meId]
  const mother = visibleMotherIds(candidates?.mother as readonly VisibleParentId[] | undefined)
  const father = visibleFatherIds(candidates?.father as readonly VisibleParentId[] | undefined)
  const submittedCount = Object.values(parentSelection.submissions).filter(Boolean).length

  return {
    seatCount: Object.keys(parentSelection.submissions).length,
    submittedCount,
    myCandidates: { mother, father },
    alreadySubmitted: !!submission,
    canSeeCandidates: mother.length > 0 && father.length > 0,
  }
}

export function canSubmitParentSelection(
  vm: ParentSelectionViewModel,
  selMother: string | null,
  selFather: string | null,
): boolean {
  if (vm.alreadySubmitted) return false
  if (!vm.canSeeCandidates) return false
  if (selMother === null || selFather === null) return false
  if (!vm.myCandidates.mother.includes(selMother as MotherParentCardId)) return false
  if (!vm.myCandidates.father.includes(selFather as FatherParentCardId)) return false
  return true
}

interface Props {
  state: GameState
  meId: string
  locale?: Locale
  onSubmit: (selection: ParentSelectionSubmission) => void | Promise<void>
}

const parentCardTitle = (id: ParentCardId): string => {
  const def = getParentCardDefinition(id)
  return def ? `${def.kind === 'mother' ? 'Mother' : 'Father'} ${def.id}` : id
}

function ParentChoiceCard({
  id,
  selected,
  onSelect,
}: {
  id: ParentCardId
  selected: boolean
  onSelect: (id: ParentCardId) => void
}) {
  const def = getParentCardDefinition(id)
  const asset = def ? resolveParentCardAssetUrls(def.assets).frontUrl : ''
  return (
    <button
      type="button"
      className={`parent-choice-card${selected ? ' is-selected' : ''}`}
      data-card-id={id}
      onClick={() => onSelect(id)}
    >
      {asset ? (
        <img className="parent-choice-card__image" src={asset} alt={parentCardTitle(id)} />
      ) : (
        <span className="parent-choice-card__fallback">{id}</span>
      )}
    </button>
  )
}

function ActiveParentSelectionOverlay({
  state,
  meId,
  locale,
  onSubmit,
}: Required<Props>) {
  const [selMother, setSelMother] = useState<MotherParentCardId | null>(null)
  const [selFather, setSelFather] = useState<FatherParentCardId | null>(null)
  const vm = useMemo(
    () => computeParentSelectionViewModel(state.parentSelection!, meId),
    [meId, state.parentSelection],
  )
  const draftedCards = useMemo(() => {
    const me = state.players.find((player) => player.id === meId)
    return {
      occ: visibleOrdinaryCardIds(me?.occupationHand),
      minor: visibleOrdinaryCardIds(me?.minorHand),
    }
  }, [meId, state.players])
  const canSubmit = canSubmitParentSelection(vm, selMother, selFather)

  const handleConfirm = () => {
    if (!canSubmit || selMother === null || selFather === null) return
    void onSubmit({ mother: selMother, father: selFather })
  }

  return (
    <div className="parent-selection-overlay" role="dialog" aria-label="Parent Cards selection">
      <div className="parent-selection-panel">
        <header className="parent-selection-header">
          <h2 className="parent-selection-title">Parent Cards</h2>
          <div className="parent-selection-status" data-already-submitted={vm.alreadySubmitted ? '1' : '0'}>
            {vm.alreadySubmitted
              ? `Waiting for other players (${vm.submittedCount}/${vm.seatCount})...`
              : 'Choose 1 mother and 1 father.'}
          </div>
        </header>

        {!vm.alreadySubmitted && vm.canSeeCandidates ? (
          <>
            <section className="parent-selection-section" data-section="mother">
              <h3 className="parent-selection-section-title">Mother</h3>
              <div className="parent-selection-row">
                {vm.myCandidates.mother.map((id) => (
                  <ParentChoiceCard
                    key={id}
                    id={id}
                    selected={selMother === id}
                    onSelect={(nextId) => setSelMother(nextId as MotherParentCardId)}
                  />
                ))}
              </div>
            </section>
            <section className="parent-selection-section" data-section="father">
              <h3 className="parent-selection-section-title">Father</h3>
              <div className="parent-selection-row">
                {vm.myCandidates.father.map((id) => (
                  <ParentChoiceCard
                    key={id}
                    id={id}
                    selected={selFather === id}
                    onSelect={(nextId) => setSelFather(nextId as FatherParentCardId)}
                  />
                ))}
              </div>
            </section>
            <div className="parent-selection-actions">
              <button
                type="button"
                className="btn-primary parent-selection-confirm"
                disabled={!canSubmit}
                onClick={handleConfirm}
              >
                Confirm parents
              </button>
            </div>
          </>
        ) : (
          <div className="parent-selection-waiting">
            Waiting for your private Parent Cards candidates.
          </div>
        )}
        {draftedCards.occ.length > 0 || draftedCards.minor.length > 0 ? (
          <section className="parent-selection-section parent-selection-drafted" data-section="drafted">
            <h3 className="parent-selection-section-title">Already drafted</h3>
            <DraftHistoryPanel
              occIds={draftedCards.occ}
              minorIds={draftedCards.minor}
              locale={locale}
            />
          </section>
        ) : null}
      </div>
    </div>
  )
}

export function ParentSelectionOverlay({ state, meId, locale = 'en', onSubmit }: Props) {
  if (state.phase !== 'parent-selection' || !state.parentSelection) return null

  return (
    <ActiveParentSelectionOverlay
      key={`${meId}:${state.gameSeed}`}
      state={state}
      meId={meId}
      locale={locale}
      onSubmit={onSubmit}
    />
  )
}
