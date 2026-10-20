import { Fragment, type ReactNode } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { ChoiceDescriptionPreview, ChoiceEffectPreview, RuleCondition } from '../../../shared/contract/types'
import { ResourceLine } from '../common/ResourceLine'
import { renderDescriptionPreview, renderEffectPreview } from '../interaction/ActionDescription'

const ACTION_SYMBOLS: Readonly<Partial<Record<string, string>>> = {
  'actions.plow.name': 'field',
  'actions.sow.name': 'sow',
  'actions.bake-bread.name': 'bread',
  'actions.set-first-player.name': 'first',
  'actions.renovate-house.name': 'upgrade',
  'actions.stables.name': 'barn',
  'actions.fencing.name': 'fence-icon',
}

type HouseType = Extract<RuleCondition, { kind: 'house-type' }>['houseType']

export const ActionSpaceDescription = ({ locale, preview }: { locale: Locale; preview: ChoiceDescriptionPreview }) => {
  const symbol = (icon: string, label: string) => <span className={`res-icon res-icon-${icon}`} role="img" aria-label={label} title={label} />
  const arrow = <span className="res-icon res-icon-arrow" aria-hidden="true" />
  const cardTypes = (types: readonly ('major' | 'minor')[]) => types.map((type, index) => <Fragment key={type}>
    {index > 0 ? ' / ' : null}{symbol(type, t(locale, `ui.improvementKinds.${type}`))}
  </Fragment>)

  const renderEffect = (effect: ChoiceEffectPreview, labelKey: string, houseType?: HouseType): ReactNode => {
    switch (effect.kind) {
      case 'rule':
        return labelKey === 'actions.renovate-house.name'
          ? symbol('upgrade', t(locale, labelKey))
          : renderNode(effect.description, houseType)
      case 'unitCost': {
        const icon = effect.unit === 'room' && houseType ? `room-${houseType}` : ACTION_SYMBOLS[effect.actionNameKey]
        if (!icon) return <span className="action-description">{renderEffectPreview(locale, effect)}</span>
        return <span className="icon-line">
          <ResourceLine locale={locale} resources={effect.resourcesPaid} mode="payment" />
          {effect.fixedFee ? <> + <ResourceLine locale={locale} resources={effect.fixedFee} mode="payment" /></> : null}
          {Object.values(effect.resourcesPaid).some(amount => (amount ?? 0) > 0) || effect.fixedFee ? arrow : null}
          {symbol(icon, t(locale, effect.actionNameKey))}
        </span>
      }
      case 'occupationFees':
        return <span className="action-icon-stack">
          <span className="icon-line action-icon-fees">{effect.food.map((food, index) => <Fragment key={index}>
            {index > 0 ? ' / ' : null}{food > 0 ? <ResourceLine locale={locale} resources={{ food }} mode="payment" /> : '0'}
          </Fragment>)}</span>
          {symbol('occupation', t(locale, 'actions.occupation.name'))}
        </span>
      case 'cardSelection':
        return <span className="icon-line">
          {effect.resourcesPaid ? <><ResourceLine locale={locale} resources={effect.resourcesPaid} mode="payment" />{arrow}</> : null}
          {cardTypes(effect.types)}
        </span>
      case 'roundCardSelection':
        return <span className="action-icon-stack">{effect.ranges.map(range => <span key={range.from} className="icon-line">
          <span className="text">{range.to === undefined ? `${range.from}+` : `${range.from}–${range.to}`}</span>
          {cardTypes(range.types)}
        </span>)}</span>
      case 'familyGrowth':
        return symbol(effect.roomRequired ? 'child' : 'child-free', t(locale, effect.roomRequired ? 'ui.ruleGrowthRoomRequired' : 'ui.ruleGrowthWithoutRoom'))
      case 'bakeRecipes':
        return symbol('bread', t(locale, 'actions.bake-bread.name'))
      case 'fencePlan':
        if (effect.fixedWood || effect.freeFences || effect.borrowed || effect.paymentBudget || effect.totalBounds || effect.segments.some(segment => segment.min !== undefined || segment.max !== undefined)) return <span className="action-description">{renderEffectPreview(locale, effect)}</span>
        return <span className="action-icon-stack">{effect.segments.map(segment => <span key={segment.kind} className="icon-line">
          {segment.woodCost > 0 ? <><ResourceLine locale={locale} resources={{ wood: segment.woodCost }} mode="payment" />{arrow}</> : null}
          {symbol(segment.kind === 'fence' ? 'fence-icon' : segment.kind, t(locale, `ui.fenceSegmentType.${segment.kind}`))}
        </span>)}</span>
      case 'firstMissingResource':
        return <span className="icon-line">{effect.resources.map((resource, index) => <Fragment key={resource}>
          {index > 0 ? arrow : null}<ResourceLine locale={locale} resources={{ [resource]: effect.amount }} />
        </Fragment>)}</span>
      case 'resourceBundle':
      case 'resourceExchange':
      case 'payment':
        return renderEffectPreview(locale, effect)
      default:
        return <span className="action-description">{renderEffectPreview(locale, effect)}</span>
    }
  }

  const renderNode = (node: ChoiceDescriptionPreview, houseType?: HouseType): ReactNode => {
    let content: ReactNode
    switch (node.kind) {
      case 'conditional':
        return node.condition.kind === 'house-type'
          ? renderNode(node.body, node.condition.houseType)
          : renderDescriptionPreview(locale, node)
      case 'action': {
        const icon = ACTION_SYMBOLS[node.labelKey]
        content = node.effectPreview ? renderEffect(node.effectPreview, node.labelKey, houseType)
          : icon ? symbol(icon, t(locale, node.labelKey))
            : renderDescriptionPreview(locale, node)
        break
      }
      case 'group': {
        const stacked = (node.operator === 'sequence' && node.parts.length > 2)
          || node.parts.some(part => part.kind === 'conditional' || (part.kind === 'action' && part.effectPreview?.kind === 'rule'))
        content = <span className={`action-icon-group${stacked ? ' action-icon-stack' : ''}`} data-flow-operator={node.operator}>
          {node.parts.map((part, index) => <Fragment key={index}>
            {index > 0 && !part.optional && !(stacked && node.operator !== 'or') ? <span className="action-icon-operator" title={t(locale, `ui.actionPreview${node.operator === 'xor' ? 'Xor' : node.operator === 'or' ? 'Or' : node.operator === 'parallel' ? 'Parallel' : 'Sequence'}`)}>{node.operator === 'xor' ? '/' : '+'}</span> : null}
            {renderNode(part, houseType)}
          </Fragment>)}
        </span>
        break
      }
    }
    return node.optional ? <span className="action-icon-group"><span className="action-icon-operator" title={t(locale, 'ui.actionPreviewOptional')}>▷</span>{content}</span> : content
  }

  return <span className="action-icon-description">{renderNode(preview)}
    {preview.workerPlacement === 'sick-preferred' ? <span className="text">{t(locale, 'ui.ruleSickWorkerDestination')}</span> : null}
  </span>
}
