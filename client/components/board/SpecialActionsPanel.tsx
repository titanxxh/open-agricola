import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { SerializedPlayerState, SerializedGameState } from '../../../shared/session/serialization'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../../shared/moor/types'
import { moorSpecialActionBaseResources } from '../../../shared/domain/moor-special-action-values'
import { moorSpecialActionBuysImprovement, moorSpecialActionEffectParams } from '../../../shared/projections/moor-special-actions'
import { ResourceLine } from '../common/ResourceLine'
import { publicAssetUrl } from '../../utils/public-asset-url'

const actionArtwork: Record<MoorSpecialActionId, { image: string; top: number }> = {
  'fell-trees': { image: 'moor-special-1-2-terrain', top: 76 },
  'slash-and-burn': { image: 'moor-special-1-2-terrain', top: 176 },
  'cut-peat': { image: 'moor-special-1-2-terrain', top: 275 },
  'horse-market': { image: 'moor-special-1-2-market-work', top: 76 },
  'hiring-fair': { image: 'moor-special-1-2-market-work', top: 176 },
  'black-market': { image: 'moor-special-1-2-market-work', top: 275 },
  'illicit-work': { image: 'moor-special-1-2-market-work', top: 372 },
}

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
  const description = t(locale, `moor.specialActions.effects.${actionId}`, moorSpecialActionEffectParams(actionId, playerCount))

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
            const artwork = actionArtwork[actionId]
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
                <span className="special-action-card__heading">
                  <span className="special-action-card__action-icon" aria-hidden="true" style={{
                    backgroundImage: `url("${publicAssetUrl(`/assets/moor/special-action-card/${artwork.image}.webp`)}")`,
                    backgroundPosition: `-18px -${artwork.top / 2}px`,
                  }} />
                  <span className="special-action-card__action-label">{label}</span>
                </span>
                <SpecialActionEffect locale={locale} actionId={actionId} playerCount={playerCount} id={effectId} />
                {moorSpecialActionBuysImprovement(actionId) && (
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
            {soloSupply.nextCardActions.map(actionId => <span key={actionId} className="special-action-card__action-icon" role="img" aria-label={specialActionLabel(locale, actionId)} style={{
              backgroundImage: `url("${publicAssetUrl(`/assets/moor/special-action-card/${actionArtwork[actionId].image}.webp`)}")`,
              backgroundPosition: `-18px -${actionArtwork[actionId].top / 2}px`,
            }} />)}
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
