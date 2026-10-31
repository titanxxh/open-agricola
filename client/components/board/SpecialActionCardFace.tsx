import { Fragment } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { MoorSpecialActionId } from '../../../shared/moor/types'
import { moorSpecialActionBaseResources } from '../../../shared/domain/moor-special-action-values'
import {
  moorSpecialActionBuysImprovement,
  moorSpecialActionEffectGroups,
  moorSpecialActionEffectParams,
} from '../../../shared/projections/moor-special-actions'
import { ResourceLine } from '../common/ResourceLine'
import { specialActionIconStyle, specialActionLabel } from './special-action-art'

export function SpecialActionHeading({ locale, actionId }: { locale: Locale; actionId: MoorSpecialActionId }) {
  return (
    <span className="special-action-card__heading">
      <span className="special-action-card__action-icon" aria-hidden="true" style={specialActionIconStyle(actionId)} />
      <span className="special-action-card__action-label">{specialActionLabel(locale, actionId)}</span>
    </span>
  )
}

export function SpecialActionEffect({ locale, actionId, playerCount, id }: {
  locale: Locale
  actionId: MoorSpecialActionId
  playerCount: number
  id?: string
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

export function SpecialActionImprovementNote({ locale, actionId }: { locale: Locale; actionId: MoorSpecialActionId }) {
  if (!moorSpecialActionBuysImprovement(actionId)) return null
  return <span className="special-action-card__note">{t(locale, 'moor.specialActions.improvementCost')}</span>
}

const playersLabel = (locale: Locale, playerCounts: readonly number[]) =>
  t(locale, 'moor.specialActions.players', { count: playerCounts.join('/') })

/** A special action card as printed for each of its player counts, outside any game. */
export function SpecialActionCardFace({ locale, players, actions, className }: {
  locale: Locale
  players: readonly number[]
  actions: readonly MoorSpecialActionId[]
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={actions.map((actionId) => specialActionLabel(locale, actionId)).join(t(locale, 'ui.listSeparator'))}
      className={`special-action-card${className ? ` ${className}` : ''}`}
    >
      <div className="special-action-card__players">{playersLabel(locale, players)}</div>
      <div className="special-action-card__actions">
        {actions.map((actionId) => {
          const groups = moorSpecialActionEffectGroups(actionId, players)
          return (
            <div key={actionId} className="special-action-card__action">
              <SpecialActionHeading locale={locale} actionId={actionId} />
              {groups.map(({ playerCounts }) => (
                <Fragment key={playerCounts.join('/')}>
                  {groups.length > 1 ? <span className="special-action-card__note">{playersLabel(locale, playerCounts)}</span> : null}
                  <SpecialActionEffect locale={locale} actionId={actionId} playerCount={playerCounts[0]!} />
                </Fragment>
              ))}
              <SpecialActionImprovementNote locale={locale} actionId={actionId} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
