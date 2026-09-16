import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { SerializedPlayerState } from '../../../shared/session/serialization'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../../shared/moor/types'
import { publicAssetUrl } from '../../utils/public-asset-url'

type SelectedSpecialAction = {
  cardId: string
  actionId: MoorSpecialActionId
} | null

type SpecialActionsPanelProps = {
  locale: Locale
  cards: MoorSpecialActionCardState[]
  currentPlayerId: string
  availability: SerializedPlayerState['moorSpecialActionAvailability']
  canTakeSpecialAction: (card: MoorSpecialActionCardState, actionId: MoorSpecialActionId) => boolean
  selected: SelectedSpecialAction
  onTakeAction: (cardId: string, actionId: MoorSpecialActionId) => void
}

const specialActionLabel = (locale: Locale, actionId: MoorSpecialActionId) =>
  t(locale, `moor.specialActions.${actionId}`)

const locationLabel = (
  locale: Locale,
  card: MoorSpecialActionCardState,
  currentPlayerId: string,
) => {
  if (card.location.kind === 'market') return t(locale, 'moor.specialActions.market')
  if (card.location.kind === 'playerFaceUp' && card.location.playerId === currentPlayerId) {
    return t(locale, 'moor.specialActions.ownFaceUp')
  }
  if (card.location.kind === 'playerFaceUp') return t(locale, 'moor.specialActions.borrowable')
  return t(locale, 'moor.specialActions.faceDown')
}

export function SpecialActionsPanel({
  locale,
  cards,
  currentPlayerId,
  availability,
  canTakeSpecialAction,
  selected,
  onTakeAction,
}: SpecialActionsPanelProps) {
  if (cards.length === 0) return null

  return (
    <div className="special-actions-panel" aria-label={t(locale, 'moor.specialActions.title')}>
      <div className="special-actions-panel__title">{t(locale, 'moor.specialActions.title')}</div>
      <div className="special-actions-panel__grid">
        {cards.map((card) => {
          const cardUsable = availability[card.id]?.cardUsable === true
          const cardLabel = card.actions.map((actionId) => specialActionLabel(locale, actionId)).join(' / ')
          return (
            <div
              key={card.id}
              className={`special-action-card${cardUsable ? '' : ' special-action-card--disabled'}`}
            >
              <div className="special-action-card__image-wrap">
                <img className="special-action-card__image" src={publicAssetUrl(card.image)} alt={cardLabel} />
                <div className={`special-action-card__image-actions action-count-${card.actions.length}`}>
                  {card.actions.map((actionId) => {
                    const label = specialActionLabel(locale, actionId)
                    const available = cardUsable && canTakeSpecialAction(card, actionId)
                    const isSelected = selected?.cardId === card.id && selected.actionId === actionId
                    return (
                      <button
                        key={`${card.id}:${actionId}`}
                        type="button"
                        className={`special-action-card__image-action${isSelected ? ' selected' : ''}`}
                        disabled={!available}
                        aria-label={label}
                        aria-pressed={isSelected}
                        title={label}
                        onClick={() => onTakeAction(card.id, actionId)}
                      />
                    )
                  })}
                </div>
              </div>
              <div className="special-action-card__status">
                {locationLabel(locale, card, currentPlayerId)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
