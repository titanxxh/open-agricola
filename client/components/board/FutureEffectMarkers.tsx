import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ChoiceDescriptionPreview, ChoiceEffectPreview, PlayerState, ScheduledEffectPreview } from '../../../shared/contract/types'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { getAnyCardDisplayName } from '../common/cardText'
import { getPlayerDisplayName } from '../../utils/player-name'
import { ResourceLine } from '../common/ResourceLine'
import { renderDescriptionPreview } from '../interaction/ActionDescription'

export type OwnedScheduledEffect = ScheduledEffectPreview & { playerId: string }

type Props = { locale: Locale; effects: OwnedScheduledEffect[]; players: PlayerState[] }

const multipliedResources = (resources: Record<string, number | undefined>, count: number) => Object.fromEntries(Object.entries(resources).map(([key, value]) => [key, (value ?? 0) * count]))

const effectMarkers = (locale: Locale, preview: ChoiceEffectPreview, count: number) => {
  if (preview.kind === 'futureSchedule') return preview.entries.flatMap((entry, index) => [
    <ResourceLine locale={locale} key={`resources-${index}`} resources={Object.fromEntries(Object.entries(entry.resources).map(([key, value]) => [key, (value ?? 0) * count]))} />,
    ...(entry.actions ?? []).map((action) => <span key={`${index}-${action.kind}`} className={`res-icon res-icon-${action.kind === 'stable' ? 'barn' : action.kind}`}><b>{action.amount * count}</b></span>),
    ...(entry.roomType ? [<span key={`room-${index}`} className={`res-icon res-icon-room-${entry.roomType}`}><b>{count}</b></span>] : []),
  ])
  if (preview.kind === 'futureOffers') return preview.entries.map((entry, index) => <span key={index} className="future-effect-offer">
    <ResourceLine locale={locale} mode="payment" resources={multipliedResources(entry.resourcesPaid, count)} />{' → '}
    <ResourceLine locale={locale} resources={multipliedResources(entry.resources, count)} />
    <span>{entry.actionNameKey ? t(locale, entry.actionNameKey) : '?'}</span>
  </span>)
  if (preview.kind === 'rule') return descriptionMarkers(locale, preview.description, count)
  if (preview.kind === 'formulaGain') {
    const fixed = Object.fromEntries(Object.entries(preview.resources).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
    const symbolic = Object.values(preview.resources).some(value => value !== undefined && typeof value !== 'number')
    return <><ResourceLine locale={locale} resources={multipliedResources(fixed, count)} />{symbolic ? <span title={t(locale, 'ui.ruleFutureQuantity')}>◇</span> : null}</>
  }
  if (preview.kind === 'resourceExchange') return <>{preview.resourcesPaid ? <><ResourceLine locale={locale} mode="payment" resources={multipliedResources(preview.resourcesPaid, count)} />{' → '}</> : null}<ResourceLine locale={locale} resources={multipliedResources(preview.resourcesGained ?? {}, count)} bonusVp={preview.bonusVp ? preview.bonusVp * count : undefined} /></>
  if (preview.kind === 'payment') return <><span title={t(locale, 'ui.ruleRequiresPayment')}>¤</span><ResourceLine locale={locale} mode="payment" resources={multipliedResources(preview.resourcesPaid ?? {}, count)} /></>
  if (preview.kind === 'ruleOperation') {
    const operation = preview.operation
    if (operation.kind === 'put-on-action-space') return <><span title={t(locale, 'ui.rulePutOnSpace', { space: t(locale, operation.spaceNameKey) })}>↦</span><ResourceLine locale={locale} resources={multipliedResources(operation.resources, count)} /></>
    if (operation.kind === 'take-stored-resources') return <ResourceLine locale={locale} resources={multipliedResources(operation.resources, count)} />
    if (operation.kind === 'card-fact-refund') return <ResourceLine locale={locale} resources={{ [operation.resource]: operation.amount * count }} />
    if (operation.kind === 'supply-worker-placement' || operation.kind === 'supply-worker-turn' || operation.kind === 'release-reserved-worker') return <span className="res-icon res-icon-farmer"><b>{count}</b></span>
    if (operation.kind === 'bounded-exchange' || operation.kind === 'discounted-action') return <span title={t(locale, 'ui.ruleRequiresPayment')}>¤◇</span>
  }
  return <span>◇</span>
}

const descriptionMarkers = (locale: Locale, description: ChoiceDescriptionPreview, count: number): ReactNode => {
  if (description.kind === 'conditional') return <span className="future-effect-conditional"><span title={t(locale, 'ui.ruleConditionalEffect')}>?</span>{descriptionMarkers(locale, description.body, count)}</span>
  if (description.kind === 'group') return <span className="future-effect-flow" data-flow-operator={description.operator}>{description.optional ? '?' : ''}{description.parts.map((part, index) => <span key={index}>{index ? description.operator === 'sequence' || description.operator === 'parallel' ? '; ' : ' / ' : ''}{descriptionMarkers(locale, part, count)}</span>)}</span>
  return <>{description.optional ? '?' : ''}{description.effectPreview ? effectMarkers(locale, description.effectPreview, count) : <span>◇</span>}</>
}

export function FutureEffectMarkers({ locale, effects, players }: Props) {
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    close.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key === 'Tab') {
        event.preventDefault()
        close.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      toggle.current?.focus()
    }
  }, [open])
  if (!effects.length) return null
  const owners = players.filter(player => effects.some(effect => effect.playerId === player.id))
  const ownerName = (player: PlayerState) => getPlayerDisplayName(locale, player.name, players.indexOf(player), player.nameIsDefault)
  return <div className="future-meeple-holder" onClick={event => event.stopPropagation()}>
    <button ref={toggle} type="button" className="future-effects-toggle" aria-label={t(locale, 'ui.scheduledEffects')} aria-expanded={open} onClick={() => setOpen(!open)}>
      {owners.map(player => <span key={player.id} className="future-effect-owner" data-owner-player={player.id} data-player-color={player.color} title={ownerName(player)}>
        {effects.filter(effect => effect.playerId === player.id).map((effect, index) => <span key={index} className="future-effect-marker" data-source-card={effect.sourceCard} title={getAnyCardDisplayName(locale, effect.sourceCard)}>
          {descriptionMarkers(locale, effect.description, effect.count)}
          {effect.count > 1 ? <span className="future-effect-count">{t(locale, 'ui.effectOccurrences', { count: effect.count })}</span> : null}
        </span>)}
      </span>)}
    </button>
    {open ? createPortal(<div className="future-effects-backdrop" onClick={() => setOpen(false)}><div onClick={event => event.stopPropagation()} className="future-effects-list" role="dialog" aria-modal="true" aria-label={t(locale, 'ui.scheduledEffects')}>
      <button ref={close} type="button" className="future-effects-close" aria-label={t(locale, 'ui.close')} onClick={() => setOpen(false)}>×</button>
      {owners.map(player => <section key={player.id} className="future-effect-owner-list" data-player-color={player.color}>
        <strong>{ownerName(player)}</strong>
        <ul>{effects.filter(effect => effect.playerId === player.id).map((effect, index) => <li key={index}>
          <strong>{getAnyCardDisplayName(locale, effect.sourceCard)}{effect.count > 1 ? ` ×${effect.count}` : ''}</strong>
          {effect.timing ? <div>{t(locale, `ui.timedEffectPhases.${effect.timing}`)}</div> : null}
          <div>{renderDescriptionPreview(locale, effect.description)}</div>
        </li>)}</ul>
      </section>)}
    </div></div>, document.body) : null}
  </div>
}
