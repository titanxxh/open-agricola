import { useMemo, useState } from 'react'
import type {
  GameState,
  ParentSelectionCandidates,
  ParentSelectionState,
  ParentSelectionSubmission,
} from '../../../shared/contract/types'
import { t, type Locale } from '../../../shared/i18n'
import type { FatherParentCardId, MotherParentCardId, ParentCardId } from '../../../shared/parents'
import { ParentCardFace } from '../../components/common/ParentCardFace'
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

function ParentChoiceCard({
  id,
  locale,
  selected,
  onSelect,
}: {
  id: ParentCardId
  locale: Locale
  selected: boolean
  onSelect: (id: ParentCardId) => void
}) {
  return (
    <button
      type="button"
      className={`parent-choice-card${selected ? ' is-selected' : ''}`}
      data-card-id={id}
      onClick={() => onSelect(id)}
    >
      <ParentCardFace id={id} locale={locale} selected={selected} />
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
    <div className="parent-selection-overlay" role="dialog" aria-label={t(locale, 'ui.parentSelection.dialog')}>
      <div className="parent-selection-panel">
        <header className="parent-selection-header">
          <h2 className="parent-selection-title">{t(locale, 'ui.parentSelection.title')}</h2>
          <div className="parent-selection-status" data-already-submitted={vm.alreadySubmitted ? '1' : '0'}>
            {vm.alreadySubmitted
              ? t(locale, 'ui.parentSelection.waitingForOthers', {
                submitted: vm.submittedCount,
                seats: vm.seatCount,
              })
              : t(locale, 'ui.parentSelection.prompt')}
          </div>
        </header>

        {!vm.alreadySubmitted && vm.canSeeCandidates ? (
          <>
            <section className="parent-selection-section" data-section="mother">
              <h3 className="parent-selection-section-title">{t(locale, 'ui.parentSelection.mother')}</h3>
              <div className="parent-selection-row">
                {vm.myCandidates.mother.map((id) => (
                  <ParentChoiceCard
                    key={id}
                    id={id}
                    locale={locale}
                    selected={selMother === id}
                    onSelect={(nextId) => setSelMother(nextId as MotherParentCardId)}
                  />
                ))}
              </div>
            </section>
            <section className="parent-selection-section" data-section="father">
              <h3 className="parent-selection-section-title">{t(locale, 'ui.parentSelection.father')}</h3>
              <div className="parent-selection-row">
                {vm.myCandidates.father.map((id) => (
                  <ParentChoiceCard
                    key={id}
                    id={id}
                    locale={locale}
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
                {t(locale, 'ui.parentSelection.confirm')}
              </button>
            </div>
          </>
        ) : vm.alreadySubmitted ? (
          <div className="parent-selection-waiting">
            {t(locale, 'ui.parentSelection.submitted')}
          </div>
        ) : (
          <div className="parent-selection-waiting">
            {t(locale, 'ui.parentSelection.candidatesWaiting')}
          </div>
        )}
        {draftedCards.occ.length > 0 || draftedCards.minor.length > 0 ? (
          <section className="parent-selection-section parent-selection-drafted" data-section="drafted">
            <h3 className="parent-selection-section-title">
              {t(locale, 'ui.parentSelection.alreadyDrafted')}
            </h3>
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
  // A new selection deals new candidates, which resets the overlay's local choice.
  const candidates = state.parentSelection.candidates[meId]

  return (
    <ActiveParentSelectionOverlay
      key={`${meId}:${candidates ? [...candidates.mother, ...candidates.father].join(',') : ''}`}
      state={state}
      meId={meId}
      locale={locale}
      onSubmit={onSubmit}
    />
  )
}
