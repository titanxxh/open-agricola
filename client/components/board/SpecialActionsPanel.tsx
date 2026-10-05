import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { SerializedPlayerState } from '../../../shared/session/serialization'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../../shared/moor/types'
import { moorSpecialActionBaseResources } from '../../../shared/domain/moor-special-action-values'
import { ResourceLine } from '../common/ResourceLine'

type SelectedSpecialAction = {
  cardId: string
  actionId: MoorSpecialActionId
} | null

type SpecialActionsPanelProps = {
  locale: Locale
  playerCount: number
  cards: MoorSpecialActionCardState[]
  currentPlayerId: string
  availability: SerializedPlayerState['moorSpecialActionAvailability']
  canTakeSpecialAction: (card: MoorSpecialActionCardState, actionId: MoorSpecialActionId) => boolean
  selected: SelectedSpecialAction
  onTakeAction: (cardId: string, actionId: MoorSpecialActionId) => void
}

const specialActionLabel = (locale: Locale, actionId: MoorSpecialActionId) =>
  t(locale, `moor.specialActions.${actionId}`)

function SpecialActionEffect({ locale, actionId, playerCount, id }: {
  locale: Locale
  actionId: MoorSpecialActionId
  playerCount: number
  id: string
}) {
  const { cost, gain } = moorSpecialActionBaseResources(actionId, playerCount)
  const terrain = actionId === 'cut-peat' ? 'moor'
    : actionId === 'fell-trees' || actionId === 'slash-and-burn' ? 'forest' : null
  const improvement = actionId === 'black-market' ? 'minor' : actionId === 'illicit-work' ? 'major' : null
  const resultIcon = improvement ?? (actionId === 'slash-and-burn' ? 'field' : null)
  const hasInput = terrain !== null || Object.values(cost).some((amount) => amount > 0)
  const description = t(locale, `moor.specialActions.effects.${actionId}`, {
    ...gain, foodCost: cost.food ?? 0, fuelCost: cost.fuel ?? 0,
  })

  return (
    <span id={id} className="special-action-card__effect" role="img" aria-label={description}>
      <span className="special-action-card__diagram" aria-hidden="true">
        {terrain && <span className="special-action-card__token"><span className={`res-icon res-icon-${terrain}`} />1</span>}
        <ResourceLine locale={locale} resources={cost} mode="payment" />
        {hasInput ? <span className="res-icon res-icon-arrow" /> : <span>+</span>}
        {resultIcon && <span className="special-action-card__token"><span className={`res-icon res-icon-${resultIcon}`} />1</span>}
        <ResourceLine locale={locale} resources={gain} mode="payment" />
      </span>
    </span>
  )
}

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
  playerCount,
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
                      <span className="special-action-card__action-label">{label}</span>
                      <SpecialActionEffect locale={locale} actionId={actionId} playerCount={playerCount} id={effectId} />
                      {(actionId === 'black-market' || actionId === 'illicit-work') && (
                        <span className="special-action-card__note">{t(locale, 'moor.specialActions.improvementCost')}</span>
                      )}
                    </button>
                  )
                })}
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
