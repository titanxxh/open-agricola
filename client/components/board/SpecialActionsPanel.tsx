import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { SerializedPlayerState, SerializedGameState } from '../../../shared/session/serialization'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../../shared/moor/types'
import { SpecialActionEffect, SpecialActionHeading, SpecialActionImprovementNote } from './SpecialActionCardFace'
import { specialActionIconStyle, specialActionLabel } from './special-action-art'

type SelectedSpecialAction = {
  cardId: string
  actionId: MoorSpecialActionId
} | null

type SpecialActionsPanelProps = {
  locale: Locale
  playerCount: number
  cards: MoorSpecialActionCardState[]
  soloSupply?: NonNullable<SerializedGameState['farmersOfTheMoor']>['soloSupply']
  currentPlayerId: string
  availability: SerializedPlayerState['moorSpecialActionAvailability']
  canTakeSpecialAction: (card: MoorSpecialActionCardState, actionId: MoorSpecialActionId) => boolean
  selected: SelectedSpecialAction
  onTakeAction: (cardId: string, actionId: MoorSpecialActionId) => void
}

const locationLabel = (
  locale: Locale,
  card: MoorSpecialActionCardState,
  currentPlayerId: string,
) => {
  if (card.location.kind === 'solo-current') return t(locale, 'solo.moorCurrent')
  if (card.location.kind === 'solo-discard') return t(locale, 'solo.moorDiscard')
  if (card.location.kind === 'market') return t(locale, 'moor.specialActions.market')
  if (card.location.kind === 'playerFaceUp' && card.location.playerId === currentPlayerId) {
    return t(locale, 'moor.specialActions.ownFaceUp')
  }
  if (card.location.kind === 'playerFaceUp') return t(locale, 'moor.specialActions.borrowable')
  return t(locale, 'moor.specialActions.faceDown')
}

export function SpecialActionsPanel({
  locale,
  playerCount,
  cards,
  soloSupply,
  currentPlayerId,
  availability,
  canTakeSpecialAction,
  selected,
  onTakeAction,
}: SpecialActionsPanelProps) {
  const renderCards = (visibleCards: MoorSpecialActionCardState[]) => visibleCards.map((card) => {
    const cardUsable = availability[card.id]?.cardUsable === true
    const cardLabel = card.actions.map((actionId) => specialActionLabel(locale, actionId)).join(' / ')
    return (
      <div
        key={card.id}
        data-card-id={card.id}
        role="group"
        aria-label={cardLabel}
        className={`special-action-card${cardUsable ? '' : ' special-action-card--disabled'}`}
      >
        <div className="special-action-card__players">
          {t(locale, 'moor.specialActions.players', { count: card.players.join('/') })}
        </div>
        <div className="special-action-card__actions">
          {card.actions.map((actionId) => {
            const label = specialActionLabel(locale, actionId)
            const available = cardUsable && canTakeSpecialAction(card, actionId)
            const isSelected = selected?.cardId === card.id && selected.actionId === actionId
            const effectId = `${card.id}-${actionId}-effect`
            return (
              <button
                key={`${card.id}:${actionId}`}
                type="button"
                className={`special-action-card__action${isSelected ? ' selected' : ''}`}
                disabled={!available}
                aria-label={label}
                aria-pressed={isSelected}
                aria-describedby={effectId}
                title={label}
                onClick={() => onTakeAction(card.id, actionId)}
              >
                <SpecialActionHeading locale={locale} actionId={actionId} />
                <SpecialActionEffect locale={locale} actionId={actionId} playerCount={playerCount} id={effectId} />
                <SpecialActionImprovementNote locale={locale} actionId={actionId} />
              </button>
            )
          })}
        </div>
        <div className="special-action-card__status">
          {locationLabel(locale, card, currentPlayerId)}
        </div>
      </div>
    )
  })
  const solo = playerCount === 1
  const current = solo ? cards.filter(card => card.location.kind === 'solo-current') : cards
  const discarded = solo ? cards.filter(card => card.location.kind === 'solo-discard')
    .sort((a, b) => (a.location.kind === 'solo-discard' ? a.location.order : 0) - (b.location.kind === 'solo-discard' ? b.location.order : 0)) : []
  if (!current.length && !discarded.length && !soloSupply) return null
  return (
    <div className="special-actions-panel" aria-label={t(locale, 'moor.specialActions.title')}>
      <div className="special-actions-panel__title">{t(locale, 'moor.specialActions.title')}</div>
      {solo && soloSupply ? <div className="solo-special-supply">
        <div role="group" aria-label={t(locale, 'solo.moorDraw', { count: soloSupply.drawCount })}>
          <span>{t(locale, 'solo.moorDraw', { count: soloSupply.drawCount })}</span>
          <span className="solo-special-next" role="group" aria-label={t(locale, 'solo.moorNext')}>
            {soloSupply.nextCardActions.map(actionId => <span key={actionId} className="special-action-card__action-icon" role="img" aria-label={specialActionLabel(locale, actionId)} style={specialActionIconStyle(actionId)} />)}
          </span>
        </div>
        <span>{t(locale, soloSupply.retentionPaid ? 'solo.moorRetained' : 'solo.moorNotRetained')}</span>
      </div> : null}
      <div className="special-actions-panel__grid">{renderCards(current)}</div>
      {discarded.length ? <details className="solo-special-discard"><summary>{t(locale, 'solo.moorDiscard')} ({discarded.length})</summary>
        <div className="special-actions-panel__grid">{renderCards(discarded)}</div>
      </details> : null}
    </div>
  )
}
