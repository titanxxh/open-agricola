import type { ReactNode } from 'react'
import type { ActionSpace } from '../../../shared/contract/types'
import { t, type Locale } from '../../../shared/i18n'
import type { MoorSpecialActionCardState, MoorSpecialActionId } from '../../../shared/moor/types'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { formatResources } from '../../utils/format'

type RoundSlot = {
  round: number
  action?: ActionSpace
}

type MobileActionsPanelProps = {
  locale: Locale
  baseActions: ActionSpace[]
  roundSlots: RoundSlot[]
  currentRound: number
  devMode: boolean
  canTakeAction: (space: ActionSpace) => boolean
  takeAction: (space: ActionSpace) => void
  seasonActions?: ActionSpace[]
  takeSeasonAction?: (spaceId: string) => void
  specialActions?: {
    cards: MoorSpecialActionCardState[]
    canTake: (card: MoorSpecialActionCardState, actionId: MoorSpecialActionId) => boolean
    selected: { cardId: string; actionId: MoorSpecialActionId } | null
    onTake: (cardId: string, actionId: MoorSpecialActionId) => void
  }
  majorImprovements?: ReactNode
  boardOverview?: ReactNode
}

const MobileActionTask = ({
  locale,
  action,
  enabled,
  onTake,
}: {
  locale: Locale
  action: ActionSpace
  enabled: boolean
  onTake: () => void
}) => {
  const resources = formatResources(locale, action.resources, true)
  return (
    <button
      type="button"
      className="mobile-action-task"
      data-mobile-action-id={action.id}
      disabled={!enabled}
      onClick={onTake}
    >
      <strong>{t(locale, action.nameKey)}</strong>
      <span>{t(locale, action.descriptionKey)}</span>
      {resources ? <span>{resources}</span> : null}
    </button>
  )
}

export function MobileActionsPanel({
  locale,
  baseActions,
  roundSlots,
  currentRound,
  devMode,
  canTakeAction,
  takeAction,
  seasonActions = [],
  takeSeasonAction,
  specialActions,
  majorImprovements,
  boardOverview,
}: MobileActionsPanelProps) {
  const actions = [
    ...baseActions,
    ...roundSlots.flatMap((slot) =>
      slot.action && (devMode || currentRound >= slot.round) ? [slot.action] : [],
    ),
  ]

  return (
    <section className="mobile-actions-panel" aria-label={t(locale, 'ui.actionArea')}>
      <h2>{t(locale, 'ui.actionArea')}</h2>
      <div className="mobile-action-tasks">
        {actions.map((action) => (
          <MobileActionTask
            key={action.id}
            locale={locale}
            action={action}
            enabled={canTakeAction(action)}
            onTake={() => takeAction(action)}
          />
        ))}
      </div>
      {seasonActions.length > 0 ? (
        <section aria-label={t(locale, 'ui.seasons.board')}>
          <h3>{t(locale, 'ui.seasons.board')}</h3>
          <div className="mobile-action-tasks">
            {seasonActions.map((action) => (
              <MobileActionTask
                key={action.id}
                locale={locale}
                action={action}
                enabled={!!takeSeasonAction && canTakeAction(action)}
                onTake={() => takeSeasonAction?.(action.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
      {specialActions?.cards.length ? (
        <section aria-label={t(locale, 'moor.specialActions.title')}>
          <h3>{t(locale, 'moor.specialActions.title')}</h3>
          <div className="mobile-special-action-tasks">
            {specialActions.cards.map((card) => {
              const cardLabel = card.actions
                .map((actionId) => t(locale, `moor.specialActions.${actionId}`))
                .join(' / ')
              return (
                <article key={card.id} className="mobile-special-action-card">
                  <img src={publicAssetUrl(card.image)} alt={cardLabel} />
                  <div className="mobile-action-tasks">
                    {card.actions.map((actionId) => {
                      const selected =
                        specialActions.selected?.cardId === card.id &&
                        specialActions.selected.actionId === actionId
                      return (
                        <button
                          key={`${card.id}:${actionId}`}
                          type="button"
                          className="mobile-action-task"
                          disabled={!specialActions.canTake(card, actionId)}
                          aria-pressed={selected}
                          onClick={() => specialActions.onTake(card.id, actionId)}
                        >
                          <strong>{t(locale, `moor.specialActions.${actionId}`)}</strong>
                        </button>
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
      {majorImprovements ? (
        <div className="mobile-major-improvements">{majorImprovements}</div>
      ) : null}
      {boardOverview ? (
        <details className="mobile-board-overview">
          <summary>{t(locale, 'ui.boardOverview')}</summary>
          {boardOverview}
        </details>
      ) : null}
    </section>
  )
}
