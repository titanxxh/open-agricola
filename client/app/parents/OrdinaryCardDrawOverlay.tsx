import type { GameState, OrdinaryCardType } from '../../../shared/contract/types'
import type { Locale } from '../../../shared/i18n'
import { PlayerCard } from '../../components/common/PlayerCard'
import { computeOrdinaryCardDrawViewModel } from './ordinary-card-draw-view-model'

const cardTypeLabel = (type: OrdinaryCardType) =>
  type === 'occupation' ? 'Occupation' : 'Minor Improvement'

interface Props {
  state: GameState
  playerId: string
  locale: Locale
  onKeep: (choiceId: string, keepCardId: string) => void | Promise<void>
}

export function OrdinaryCardDrawOverlay({ state, playerId, locale, onKeep }: Props) {
  const vm = computeOrdinaryCardDrawViewModel(state.ordinaryCardDrawChoices, playerId)
  const choice = vm.choice
  if (!choice) return null

  const typeLabel = cardTypeLabel(choice.cardType)

  return (
    <div className="ordinary-draw-overlay" role="dialog" aria-label="Ordinary card draw choice">
      <div className="ordinary-draw-panel">
        <header className="ordinary-draw-header">
          <h2 className="ordinary-draw-title">Keep 1 {typeLabel}</h2>
          <div className="ordinary-draw-status">
            Drawn by {choice.sourceCard ?? 'card effect'}
            {vm.queueLength > 1 ? ` (${vm.queueLength} choices queued)` : ''}
          </div>
        </header>
        <div className="ordinary-draw-row">
          {choice.candidates.map((cardId) => (
            <div className="ordinary-draw-card" data-card-id={cardId} key={cardId}>
              <div className="ordinary-draw-card__preview">
                <PlayerCard
                  locale={locale}
                  cardId={cardId}
                  cardType={choice.cardType}
                  enablePreview={false}
                />
                <div className="ordinary-draw-card__id">{cardId}</div>
              </div>
              <button
                type="button"
                className="btn-primary ordinary-draw-card__keep"
                onClick={() => void onKeep(choice.id, cardId)}
              >
                Keep {cardId}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
