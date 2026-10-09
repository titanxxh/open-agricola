import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { AnimalKey } from '../../../shared/contract/animals'
import { ResourceLine } from '../common/ResourceLine'
import { ResourceText } from '../common/ResourceText'
import { formatAnimalCounts } from '../../utils/format'
import type {
  ActionChoiceOption,
  ChoiceMultiSelect,
  ChoiceDescriptionPreview,
  ChoiceEffectPreview,
  PaymentResourceMap,
  Resource,
} from '../../../shared/contract/types'
import { AnytimeBar } from './AnytimeBar'
import { getAnyCardDisplayName, translateCardText } from '../common/cardText'
import { getParentFatherOptionText } from '../common/parentCardText'
import { ResourceQuantitySelectPanel } from './ResourceQuantitySelectPanel'
import { ResourceBatchExchangePanel } from './ResourceBatchExchangePanel'
import type {
  InteractionBarActions,
  InteractionBarModel,
  InteractionBarText,
} from '../../app/interaction-bar-presentation'

type ResourceExchangeLabelParams = {
  resourcesPaid?: PaymentResourceMap
  resourcesGained?: Partial<Resource>
  bonusVp?: number
}

type HeatingPending = NonNullable<InteractionBarModel['pending']['heating']>

const emptyAnimalCounts: Record<AnimalKey, number> = { sheep: 0, boar: 0, cattle: 0, horse: 0 }
const animalCountOrder: AnimalKey[] = ['sheep', 'boar', 'cattle', 'horse']

const clampWhole = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))

const renderInteractionText = (locale: Locale, text: InteractionBarText): string => {
  if (text.text !== undefined) return text.text
  return text.key ? translateCardText(locale, text.key, text.params) : ''
}

const AnimalCountLine = ({
  locale,
  counts,
}: {
  locale: Locale
  counts: Partial<Record<AnimalKey, number>>
}) => (
  <span className="interaction-animal-counts">
    {animalCountOrder
      .filter((animal) => animal !== 'horse' || counts.horse !== undefined)
      .map((animal) => {
        const count = counts[animal] ?? 0
        const label = `${t(locale, `resources.${animal}`)}: ${count}`
        return (
          <span key={animal} className="interaction-animal-count" title={label} aria-label={label}>
            <span className={`res-icon res-icon-${animal}`} aria-hidden="true" />
            <span className="interaction-animal-count-value">{count}</span>
          </span>
        )
      })}
  </span>
)

const HeatingPanel = ({
  locale,
  pending,
  title,
  subtitle,
  isInteractive,
  onConfirm,
}: {
  locale: Locale
  pending: HeatingPending
  title?: InteractionBarText
  subtitle?: InteractionBarText
  isInteractive: boolean
  onConfirm: (payload: { fuelUsed: number; woodToFuel: number }) => void
}) => {
  const [woodToFuel, setWoodToFuel] = useState(0)
  const [fuelUsed, setFuelUsed] = useState(Math.min(pending.required, pending.maxFuelPayable))
  const maxWood = pending.maxWoodConvertibleToFuel
  const maxFuel = Math.min(pending.required, pending.maxFuelPayable + woodToFuel)
  const payload = {
    woodToFuel: clampWhole(woodToFuel, 0, maxWood),
    fuelUsed: clampWhole(fuelUsed, 0, maxFuel),
  }
  const commit = () => onConfirm(payload)
  return (
    <>
      <div className="interaction-title">
        {title ? renderInteractionText(locale, title) : t(locale, 'ui.harvestHeatingTitle')}
      </div>
      <div className="interaction-subtitle">
        {subtitle ? renderInteractionText(locale, subtitle) : t(locale, 'ui.harvestHeatingSubtitle', {
          player: pending.playerName,
          count: pending.required,
        })}
      </div>
      <div className="interaction-resource-quantity-panel">
        <div className="resource-quantity-grid">
          <label className="resource-quantity-row">
            <span className="resource-quantity-label">
              {t(locale, 'ui.harvestHeatingWoodToFuel')}
            </span>
            <input
              type="number"
              min={0}
              max={maxWood}
              value={woodToFuel}
              disabled={!isInteractive || maxWood <= 0}
              onChange={(event) => setWoodToFuel(clampWhole(Number(event.target.value), 0, maxWood))}
            />
          </label>
          <label className="resource-quantity-row">
            <span className="resource-quantity-label">
              {t(locale, 'ui.harvestHeatingFuelUsed')}
            </span>
            <input
              type="number"
              min={0}
              max={maxFuel}
              value={fuelUsed}
              disabled={!isInteractive || maxFuel <= 0}
              onChange={(event) => setFuelUsed(clampWhole(Number(event.target.value), 0, maxFuel))}
            />
          </label>
        </div>
        <div className="interaction-actions resource-quantity-actions">
          <button onClick={commit} disabled={!isInteractive || pending.isConfirmDisabled?.(payload)}>
            {t(locale, 'ui.harvestHeatingConfirm')}
          </button>
        </div>
      </div>
    </>
  )
}

const isResourceExchangeLabelParams = (
  value: unknown,
): value is ResourceExchangeLabelParams =>
  !!value && typeof value === 'object'

const hasPositiveResources = (resources?: Record<string, number | undefined>) =>
  !!resources && Object.values(resources).some((value) => (value ?? 0) > 0)

const renderResourceAwareText = (text: string): ReactNode =>
  text.includes('<') ? (
    <ResourceText text={text} className="interaction-option-resource-text" />
  ) : text

const renderPaymentSourceCards = (
  locale: Locale,
  sourceCards: string[] | undefined,
): ReactNode => {
  if (!sourceCards || sourceCards.length === 0) return null
  const names = sourceCards.map((id) => getAnyCardDisplayName(locale, id))
  const joiner = locale === 'zh' ? '、' : ', '
  return (
    <span className="payment-option-sources">
      {t(locale, 'ui.interactionPaymentVia', { cards: names.join(joiner) })}
    </span>
  )
}

const renderEffectPreview = (
  locale: Locale,
  effectPreview: ChoiceEffectPreview,
): ReactNode => {
  if (effectPreview.kind === 'fieldContents') {
    return <span>{effectPreview.sourceCard ? getAnyCardDisplayName(locale, effectPreview.sourceCard) : t(locale, 'ui.tileField')}{': '}
      <ResourceLine locale={locale} resources={effectPreview.resources} hideZero />
    </span>
  }
  if (effectPreview.kind === 'cardScore') {
    return <span data-card-score={effectPreview.delta}>{t(locale, 'ui.choiceCardScore', {
      card: getAnyCardDisplayName(locale, effectPreview.cardId),
      delta: `${effectPreview.delta >= 0 ? '+' : ''}${effectPreview.delta}`,
    })}</span>
  }
  if (effectPreview.kind === 'actionSpace') {
    return <span data-space-id={effectPreview.spaceId}>
      <strong>{t(locale, effectPreview.nameKey)}</strong>
      <span className="interaction-option-subtitle">{renderResourceAwareText(t(locale, effectPreview.descriptionKey))}</span>
    </span>
  }
  if (effectPreview.kind === 'futureOffers') {
    return <span>{effectPreview.entries.map((entry, index) => <span key={index} className="interaction-description-part">
      {index > 0 ? '; ' : ''}{t(locale, 'ui.choiceScheduleRound', { round: entry.round })}{' '}
      {t(locale, 'ui.choiceOptionalPurchase')}{' '}
      <ResourceLine locale={locale} mode="payment" resources={entry.resourcesPaid} hideZero />
      <span aria-hidden="true"> → </span>
      {entry.actionNameKey ? t(locale, entry.actionNameKey) : <ResourceLine locale={locale} resources={entry.resources} hideZero />}
    </span>)}</span>
  }
  if (effectPreview.kind === 'resourceMovement') {
    const location = effectPreview.from.kind === 'card' ? effectPreview.from : effectPreview.to
    const name = location.kind === 'card' ? getAnyCardDisplayName(locale, location.cardId)
      : location.kind === 'actionSpace' ? t(locale, location.nameKey) : ''
    return <span>
      {t(locale, effectPreview.from.kind === 'card' ? 'ui.choiceTakeFromCard' : 'ui.choiceReturnToSpace', { target: name })}{' '}
      <ResourceLine locale={locale} resources={effectPreview.resources} hideZero />
    </span>
  }
  if (effectPreview.kind === 'futureSchedule') {
    return <span className="interaction-future-schedule">{effectPreview.entries.map((entry, index) => (
      <span key={index} className="interaction-description-part">
        {index > 0 ? '; ' : ''}{entry.endRound ? t(locale, 'ui.choiceScheduleRounds', { start: entry.round, end: entry.endRound }) : t(locale, 'ui.choiceScheduleRound', { round: entry.round })}{' '}
        <ResourceLine locale={locale} resources={entry.resources} hideZero />
        {entry.resourceCondition ? <span> ({t(locale, 'ui.choiceMinimumResource')} <ResourceLine locale={locale} resources={{ [entry.resourceCondition.resource]: entry.resourceCondition.amount }} hideZero />)</span> : null}
        {entry.roomType ? <span>{t(locale, 'ui.choiceFutureRoom', { room: t(locale, `resources.${entry.roomType}`) })}</span> : null}
        {entry.actions?.map((action) => <span key={action.kind}> {t(locale, `ui.choiceFuture${action.kind}`, { amount: action.amount })}{action.resourcesPaid ? <> — <ResourceLine locale={locale} mode="payment" resources={action.resourcesPaid} hideZero /></> : null}</span>)}
      </span>
    ))}</span>
  }
  if (effectPreview.kind === 'payment') {
    return (
      <span className="payment-option-content">
        {hasPositiveResources(effectPreview.resourcesPaid) ? (
          <ResourceLine locale={locale} mode="payment" resources={effectPreview.resourcesPaid ?? {}} hideZero />
        ) : (
          <span>{t(locale, 'ui.interactionPaymentFree')}</span>
        )}
        {!!effectPreview.cardUsed && (
          <span className="payment-option-card">
            {' '}
            ({t(locale, 'ui.interactionPaymentReturn')} {getAnyCardDisplayName(locale, effectPreview.cardUsed)})
          </span>
        )}
        {renderPaymentSourceCards(locale, effectPreview.sourceCards)}
      </span>
    )
  }
  if (effectPreview.kind === 'resourceExchange') {
    return (
      <span className="interaction-resource-exchange">
        {effectPreview.resourcesPaid ? <>
          {hasPositiveResources(effectPreview.resourcesPaid) ? <ResourceLine locale={locale} mode="payment" resources={effectPreview.resourcesPaid} hideZero /> : <span>{t(locale, 'ui.interactionPaymentFree')}</span>}
          <span className="interaction-resource-exchange-arrow" aria-hidden="true"><span className="res-icon res-icon-arrow" /></span>
        </> : null}
        <ResourceLine
          locale={locale}
          resources={effectPreview.resourcesGained ?? {}}
          bonusVp={effectPreview.bonusVp ?? 0}
          hideZero
        />
      </span>
    )
  }
  return renderResourceAwareText(effectPreview.text)
}

const renderDescriptionAction = (
  locale: Locale,
  preview: Extract<ChoiceDescriptionPreview, { kind: 'action' }>,
  labelOverride?: string,
): ReactNode => {
  const label = labelOverride ?? translateCardText(
    locale,
    preview.labelKey,
    preview.labelParams as Record<string, string | number> | undefined,
  )
  if (!preview.effectPreview) return renderResourceAwareText(label)
  return (
    <span className="interaction-description-action">
      <span className="interaction-description-action-main">
        {renderEffectPreview(locale, preview.effectPreview)}
      </span>
      <>{preview.showLabel !== false || labelOverride ? <span className="interaction-option-subtitle">{renderResourceAwareText(label)}</span> : null}</>
    </span>
  )
}

const renderDescriptionPreview = (
  locale: Locale,
  preview: ChoiceDescriptionPreview,
  labelOverride?: string,
): ReactNode => {
  if (preview.kind === 'action') return renderDescriptionAction(locale, preview, labelOverride)
  return (
    <>
      {preview.parts.map((part, index) => (
        <span key={index} className="interaction-description-part">
          {index > 0 ? (
            <span className="interaction-description-separator">
              {preview.separator}
            </span>
          ) : null}
          {renderDescriptionPreview(locale, part)}
        </span>
      ))}
    </>
  )
}

const getEffectPreviewSubtitle = (
  locale: Locale,
  option: ActionChoiceOption,
): ReactNode => {
  switch (option.effectPreview?.kind) {
    case 'payment':
      return translateCardText(locale, 'actions.pay.name')
    case 'resourceExchange':
      return translateCardText(locale, 'ui.interactionResourceExchange')
    default:
      return null
  }
}

const renderOptionLabel = (
  locale: Locale,
  option: ActionChoiceOption,
): ReactNode => {
  const parentLabel = getParentFatherOptionText(locale, option)
  if (parentLabel) return renderResourceAwareText(parentLabel)
  if (
    option.labelKey === 'prompt.selectPaymentOption' &&
    option.labelParams &&
    typeof option.labelParams === 'object' &&
    'resourcesPaid' in option.labelParams
  ) {
    return (
      <span className="payment-option-content">
        {Object.keys(option.labelParams.resourcesPaid as PaymentResourceMap).filter(k => (option.labelParams?.resourcesPaid as Record<string, number>)[k] > 0).length === 0 ? (
          <span>{t(locale, 'ui.interactionPaymentFree')}</span>
        ) : (
          <ResourceLine locale={locale} mode="payment" resources={option.labelParams.resourcesPaid as PaymentResourceMap} hideZero />
        )}
        {!!option.labelParams.cardUsed && (
          <span className="payment-option-card">
            {' '}
            ({t(locale, 'ui.interactionPaymentReturn')} {getAnyCardDisplayName(locale, option.labelParams.cardUsed as string)})
          </span>
        )}
        {renderPaymentSourceCards(
          locale,
          Array.isArray(option.labelParams.sourceCards)
            ? (option.labelParams.sourceCards as string[])
            : undefined,
        )}
      </span>
    )
  }
  if (
    option.labelKey === 'ui.interactionResourceExchange' &&
    isResourceExchangeLabelParams(option.labelParams)
  ) {
    return (
      <span className="interaction-resource-exchange">
        {hasPositiveResources(option.labelParams.resourcesPaid) ? (
          <ResourceLine
            locale={locale}
            mode="payment"
            resources={option.labelParams.resourcesPaid ?? {}}
            hideZero
          />
        ) : (
          <span>{t(locale, 'ui.interactionPaymentFree')}</span>
        )}
        <span className="interaction-resource-exchange-arrow" aria-hidden="true">
          <span className="res-icon res-icon-arrow" />
        </span>
        <ResourceLine
          locale={locale}
          resources={option.labelParams.resourcesGained ?? {}}
          bonusVp={option.labelParams.bonusVp ?? 0}
          hideZero
        />
      </span>
    )
  }
  if (
    option.labelKey === 'ui.interactionActionOrReplace' &&
    option.labelParams &&
    typeof option.labelParams.actionNameKey === 'string'
  ) {
    return t(locale, option.labelKey, {
      action: t(locale, option.labelParams.actionNameKey),
    })
  }
  if (
    option.labelKey === 'ui.interactionUseCard' &&
    option.labelParams &&
    typeof option.labelParams.cardNameKey === 'string'
  ) {
    return t(locale, option.labelKey, {
      card: translateCardText(locale, option.labelParams.cardNameKey),
    })
  }
  const label = translateCardText(
    locale,
    option.labelKey,
    option.labelParams as Record<string, string | number> | undefined,
  )
  return renderResourceAwareText(label)
}

const renderOptionContent = (
  locale: Locale,
  option: ActionChoiceOption,
): ReactNode => {
  if (option.descriptionPreview) {
    return (
      <span className="interaction-option-stack">
        <span className="interaction-option-main">
          {renderDescriptionPreview(locale, option.descriptionPreview, getParentFatherOptionText(locale, option))}
        </span>
      </span>
    )
  }
  if (!option.effectPreview) {
    return <span>{renderOptionLabel(locale, option)}{option.targetCard ? <span className="interaction-option-subtitle" data-target-card={option.targetCard.cardId}>
      {t(locale, 'ui.choiceActionCard')}: {option.targetCard.actionNameKeys.map((key) => t(locale, key)).join(' / ')}
    </span> : null}</span>
  }
  const subtitle = getEffectPreviewSubtitle(locale, option)
  return (
    <span className="interaction-option-stack">
      <span className="interaction-option-main">
        {renderEffectPreview(locale, option.effectPreview)}
      </span>
      {subtitle ? (
        <span className="interaction-option-subtitle">{subtitle}</span>
      ) : null}
    </span>
  )
}

const isSkipChoiceOption = (option: ActionChoiceOption) =>
  option.value === '__skip__' || option.labelKey === 'ui.interactionOptionalSkip'

const renderChoiceOptionContent = ({
  locale,
  option,
  isOptionalActionPrompt,
  optionalActionName,
  triggerCardName,
}: {
  locale: Locale
  option: ActionChoiceOption
  isOptionalActionPrompt: boolean
  optionalActionName: string | null
  triggerCardName: string | null
}): ReactNode => {
  if (isOptionalActionPrompt && isSkipChoiceOption(option)) {
    if (triggerCardName) {
      return t(locale, 'ui.interactionOptionalSkipCard', { card: triggerCardName })
    }
    if (optionalActionName) {
      return t(locale, 'ui.interactionOptionalSkipAction', { action: optionalActionName })
    }
  }
  return renderOptionContent(locale, option)
}

function ChoiceMultiSelectPanel({ locale, options, selection, resolveChoice, isInteractive }: {
  locale: Locale
  options: ActionChoiceOption[]
  selection: ChoiceMultiSelect
  resolveChoice: (value: string) => void
  isInteractive: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { valuePrefix, minSelections, maxSelections } = selection
  const toggle = (option: ActionChoiceOption) => {
    if (!isInteractive || option.disabled) return
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(option.value)) next.delete(option.value)
      else if (next.size < maxSelections) next.add(option.value)
      return next
    })
  }
  const confirm = () => resolveChoice(valuePrefix + options
    .filter((option) => selected.has(option.value))
    .map((option) => option.value).join(','))

  return (
    <div className="choice-multi-select">
      <div className="interaction-subtitle" aria-live="polite">
        {t(locale, 'ui.interactionSelectionSubtitle', { selected: selected.size, max: maxSelections })}
      </div>
      <div className="choice-multi-select-grid">
        {options.map((option) => {
          const checked = selected.has(option.value)
          return (
            <label key={option.value} className={`choice-multi-select-tile${checked ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!isInteractive || !!option.disabled || (!checked && selected.size >= maxSelections)}
                onChange={() => toggle(option)}
              />
              {renderOptionContent(locale, option)}
            </label>
          )
        })}
      </div>
      <div className="interaction-actions">
        <button onClick={confirm} disabled={!isInteractive || selected.size < minSelections}>
          {t(locale, 'ui.interactionConfirmButton')} ({selected.size}/{maxSelections})
        </button>
        {minSelections === 0 ? (
          <button onClick={() => resolveChoice(valuePrefix)} disabled={!isInteractive}>
            {t(locale, 'ui.interactionOptionalSkip')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function CollectorMultiSelect({ locale, options, needed, resolveChoice, isInteractive }: {
  locale: Locale
  options: ActionChoiceOption[]
  needed: number
  resolveChoice: (value: string) => void
  isInteractive: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else if (next.size < needed) {
        next.add(value)
      }
      return next
    })
  }

  return (
    <div className="collector-multi-select">
      <div className="interaction-subtitle">
        {t(locale, 'ui.interactionCollectorCount', { selected: selected.size, needed })}
      </div>
      <div className="collector-options">
        {options.map((option) => {
          const content = renderOptionContent(locale, option)
          const showValueIcon = typeof content === 'string'
          return (
            <label key={option.value} className={`collector-option ${selected.has(option.value) ? 'selected' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                disabled={!isInteractive || (!selected.has(option.value) && selected.size >= needed)}
              />
              {showValueIcon ? <span className={`res-icon res-icon-${option.value}`} /> : null}
              {content}
            </label>
          )
        })}
      </div>
      <button
        className="collector-confirm"
        onClick={() => resolveChoice([...selected].join(','))}
        disabled={!isInteractive || selected.size !== needed}
      >
        {t(locale, 'ui.interactionConfirmButton')} ({selected.size}/{needed})
      </button>
    </div>
  )
}

type Props = {
  model: InteractionBarModel
  actions: InteractionBarActions
}

export const InteractionBar = ({
  model,
  actions,
}: Props) => {
  const barRef = useRef<HTMLDivElement>(null)
  const { locale, isInteractive } = model
  const body = model.body
  const choiceModel = model.choice
  const heatingPending = model.pending.heating
  const resourceQuantitySelect = model.pending.resourceQuantitySelect
  const resourceBatchExchangeSelect = model.pending.resourceBatchExchangeSelect
  const fencePlacementMode = model.farm.fence.placementMode
  const setFencePlacementMode = model.farm.fence.setPlacementMode
  const borrowedFenceSources = model.farm.fence.borrowedSources
  const animalReorg = model.animalReorg.state
  const reorgRemaining = model.animalReorg.remaining
  const hasReorgOverflow = model.animalReorg.hasOverflow
  const canUndoStep = model.controls.canUndoStep
  const canUndoAction = model.controls.canUndoAction
  const historyLength = model.controls.historyLength
  const hasActionStartSnapshot = model.controls.hasActionStartSnapshot
  const anytimeActions = model.controls.anytimeActions
  const {
    resolveChoice,
    confirmNextPlayer,
    confirmPlayerSwitch,
    confirmHarvestFeed,
    confirmHeating,
    undoStep: onUndo,
    undoAction: onUndoAction,
    showScoring: onShowScoring,
    takeAnytimeAction,
    confirmAnimalReorg,
    cancelAnimalDiscardPrompt,
  } = actions

  useLayoutEffect(() => {
    const bar = barRef.current
    const app = bar?.closest<HTMLElement>('.app')
    if (!bar || !app) return

    const updateHeight = () => {
      app.style.setProperty('--interaction-bar-height', `${bar.getBoundingClientRect().height}px`)
    }
    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      return () => app.style.removeProperty('--interaction-bar-height')
    }

    const observer = new ResizeObserver(updateHeight)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      app.style.removeProperty('--interaction-bar-height')
    }
  }, [])

  return (
    <div ref={barRef} className="interaction-bar">
      <div className="interaction-bar__top">
        <div className="interaction-bar__controls">
          <button onClick={onUndo} disabled={!isInteractive || historyLength === 0 || !canUndoStep}>
            {t(locale, 'ui.undoStep')}
          </button>
          <button onClick={onUndoAction} disabled={!isInteractive || !hasActionStartSnapshot || !canUndoAction}>
            {t(locale, 'ui.undoAction')}
          </button>
          <button onClick={onShowScoring}>
            {t(locale, 'ui.scoringPadButton')}
          </button>
        </div>
        <AnytimeBar
          anytimeActions={anytimeActions}
          locale={locale}
          isInteractive={isInteractive}
          takeAnytimeAction={takeAnytimeAction}
          variant="inline"
        />
      </div>
      {body.kind !== 'none' ? (
        <div className="interaction-bar__body">
          {body.kind === 'animalReorg' ? (
            <>
              <div className="interaction-title">
                {body.title ? renderInteractionText(locale, body.title) : null}
              </div>
              <div className="interaction-subtitle">
                {body.subtitle ? renderInteractionText(locale, body.subtitle) : null}
              </div>
              <div className="interaction-reorg-panel">
                <div className="interaction-reorg-title">
                  {t(locale, 'ui.reorgPendingTitle')}
                </div>
                <div className="interaction-reorg-row">
                  <span>{t(locale, 'ui.reorgPending')}</span>
                  <AnimalCountLine locale={locale} counts={reorgRemaining ?? emptyAnimalCounts} />
                </div>
                {hasReorgOverflow ? (
                  <div className="interaction-error">{t(locale, 'ui.reorgOverAssign')}</div>
                ) : null}
                {animalReorg?.confirmDiscard ? (
                  <div className="interaction-reorg-warning">
                    <div>
                      {t(locale, 'ui.reorgDiscardPrompt', {
                        animals: formatAnimalCounts(
                          locale,
                          reorgRemaining ?? emptyAnimalCounts,
                        ),
                      })}
                    </div>
                    <div className="interaction-actions">
                      <button onClick={cancelAnimalDiscardPrompt} disabled={!isInteractive}>
                        {t(locale, 'ui.reorgAdjustMore')}
                      </button>
                      <button onClick={confirmAnimalReorg} disabled={!isInteractive || model.animalReorg.confirmDisabled}>
                        {t(locale, 'ui.reorgDiscardConfirm')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="interaction-actions">
                    <button onClick={confirmAnimalReorg} disabled={!isInteractive || hasReorgOverflow || model.animalReorg.confirmDisabled}>
                      {t(locale, 'ui.reorgConfirm')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : body.kind === 'resourceBatchExchangeSelect' && resourceBatchExchangeSelect ? (
            <ResourceBatchExchangePanel
              locale={locale}
              discardAvailableByResource={resourceBatchExchangeSelect.discardAvailableByResource}
              receiveResources={resourceBatchExchangeSelect.receiveResources}
              maxTotal={resourceBatchExchangeSelect.maxTotal}
              promptKey={resourceBatchExchangeSelect.promptKey}
              isConfirmDisabled={resourceBatchExchangeSelect.isConfirmDisabled}
              onConfirm={resourceBatchExchangeSelect.onConfirm}
              onCancel={resourceBatchExchangeSelect.onCancel}
            />
          ) : body.kind === 'resourceQuantitySelect' && resourceQuantitySelect ? (
            <ResourceQuantitySelectPanel
              locale={locale}
              availableByResource={resourceQuantitySelect.availableByResource}
              promptKey={resourceQuantitySelect.promptKey}
              requireAtLeastOne={resourceQuantitySelect.requireAtLeastOne}
              isConfirmDisabled={resourceQuantitySelect.isConfirmDisabled}
              onConfirm={resourceQuantitySelect.onConfirm}
              onCancel={resourceQuantitySelect.onCancel}
            />
          ) : body.kind === 'heating' && heatingPending ? (
            <HeatingPanel
              key={`${heatingPending.playerName}:${heatingPending.required}:${heatingPending.maxFuelPayable}:${heatingPending.maxWoodConvertibleToFuel}`}
              locale={locale}
              pending={heatingPending}
              title={body.title}
              subtitle={body.subtitle}
              isInteractive={isInteractive}
              onConfirm={confirmHeating}
            />
          ) : body.kind === 'harvestFeed' ? (
            <>
              <div className="interaction-title">
                {body.title ? renderInteractionText(locale, body.title) : null}
              </div>
              <div className="interaction-subtitle">
                {body.subtitle ? renderInteractionText(locale, body.subtitle) : null}
              </div>
              <div className="interaction-actions">
                <button onClick={confirmHarvestFeed} disabled={!isInteractive || model.pending.harvestFeedConfirmDisabled}>
                  {t(locale, 'ui.interactionConfirmButton')}
                </button>
              </div>
            </>
          ) : body.kind === 'engineBlocked' ? (
            <div className="interaction-title">
              {body.title ? renderInteractionText(locale, body.title) : null}
            </div>
          ) : body.kind === 'choice' && choiceModel ? (
            <>
              <div className="interaction-title">
                {renderInteractionText(locale, choiceModel.title)}
              </div>
              {choiceModel.triggerSubtitle ? (
                <div className="interaction-subtitle">
                  {renderInteractionText(locale, choiceModel.triggerSubtitle)}
                </div>
              ) : null}
              {choiceModel.hint ? (
                <div className="interaction-rule-hint">
                  {renderInteractionText(locale, choiceModel.hint)}
                </div>
              ) : null}
              {choiceModel.subtitles.map((subtitle, index) => (
                <div
                  key={`${subtitle.key ?? subtitle.text ?? 'subtitle'}:${index}`}
                  className={`interaction-subtitle${subtitle.className ? ` ${subtitle.className}` : ''}`}
                >
                  {renderInteractionText(locale, subtitle)}
                </div>
              ))}
              {choiceModel.borrowedFenceControlsVisible && borrowedFenceSources ? (
                <div className="borrowed-fence-source-controls">
                  <div className="borrowed-fence-source-title">
                    {t(locale, 'ui.borrowedFenceSourceTitle')}
                  </div>
                  <div className="borrowed-fence-source-options">
                    {borrowedFenceSources.donors.map((donor) => {
                      const isSelected =
                        borrowedFenceSources.selectedPlayerId === donor.playerId
                      const isAtCap = donor.allocated >= donor.cap
                      return (
                        <button
                          key={donor.playerId}
                          type="button"
                          className={`borrowed-fence-source-option${isSelected ? ' active' : ''}`}
                          data-player-color={donor.color}
                          aria-pressed={isSelected}
                          disabled={!isInteractive || (!isSelected && isAtCap)}
                          onClick={() => borrowedFenceSources.onSelect(donor.playerId)}
                        >
                          <span className="borrowed-fence-source-dot" />
                          <span className="borrowed-fence-source-name">{donor.name}</span>
                          <span className="borrowed-fence-source-count">
                            {t(locale, 'ui.borrowedFenceSourceCount', {
                              allocated: donor.allocated,
                              cap: donor.cap,
                            })}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {choiceModel.fenceModeToggleVisible && setFencePlacementMode ? (
                <div
                  className="fence-mode-toggle"
                  role="radiogroup"
                  aria-label={t(locale, 'ui.fenceModeToggle')}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={fencePlacementMode === 'fence'}
                    className={fencePlacementMode === 'fence' ? 'active' : ''}
                    onClick={() => setFencePlacementMode('fence')}
                  >
                    {t(locale, 'ui.fenceModeFence')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={fencePlacementMode === 'palisade'}
                    className={fencePlacementMode === 'palisade' ? 'active' : ''}
                    onClick={() => setFencePlacementMode('palisade')}
                  >
                    {t(locale, 'ui.fenceModePalisade')}
                  </button>
                </div>
              ) : null}
              {choiceModel.errors.map((error, index) => (
                <div key={`${error.key ?? error.text ?? 'error'}:${index}`} className="interaction-error">
                  {renderInteractionText(locale, error)}
                </div>
              ))}
              {!choiceModel.showOptions ? null : choiceModel.multiSelect ? (
                <ChoiceMultiSelectPanel
                  key={`${choiceModel.multiSelect.valuePrefix}:${model.pending.choice?.playerIndex}:${model.pending.choice?.spaceId}:${choiceModel.multiSelect.minSelections}:${choiceModel.multiSelect.maxSelections}:${choiceModel.visibleOptions.map(({ option }) => `${option.value}:${!!option.disabled}`).join('|')}`}
                  locale={locale}
                  options={choiceModel.visibleOptions.map((entry) => entry.option)}
                  selection={choiceModel.multiSelect}
                  resolveChoice={resolveChoice}
                  isInteractive={isInteractive}
                />
              ) : choiceModel.useCollector ? (
                <CollectorMultiSelect
                  locale={locale}
                  options={choiceModel.visibleOptions.map((entry) => entry.option)}
                  needed={choiceModel.collectorNeeded}
                  resolveChoice={resolveChoice}
                  isInteractive={isInteractive}
                />
              ) : (
                <div className="interaction-actions">
                  {choiceModel.visibleOptions.map(({ option, disabled, disabledTitleKey }) => {
                    return (
                      <button
                        key={option.value}
                        disabled={disabled}
                        title={disabledTitleKey ? t(locale, disabledTitleKey) : undefined}
                        className={option.disabled ? 'choice-option-disabled' : undefined}
                        onClick={() => {
                          if (option.disabled) return
                          resolveChoice(option.value)
                        }}
                      >
                        {renderChoiceOptionContent({
                          locale,
                          option,
                          isOptionalActionPrompt: choiceModel.isOptionalActionPrompt,
                          optionalActionName: choiceModel.optionalActionName,
                          triggerCardName: choiceModel.triggerCardName,
                        })}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : body.kind === 'playerSwitch' ? (
            <>
              <div className="interaction-title">
                {body.title ? renderInteractionText(locale, body.title) : null}
              </div>
              <div className="interaction-actions">
                <button onClick={confirmPlayerSwitch} disabled={!isInteractive || model.pending.playerSwitchConfirmDisabled}>
                  {t(locale, 'ui.interactionPlayerSwitchConfirm')}
                </button>
              </div>
            </>
          ) : body.kind === 'nextPlayer' ? (
            <>
              <div className="interaction-title">
                {body.title ? renderInteractionText(locale, body.title) : null}
              </div>
              <div className="interaction-actions">
                <button onClick={confirmNextPlayer} disabled={!isInteractive || model.pending.nextPlayerConfirmDisabled}>
                  {t(locale, 'ui.interactionConfirmSwitch')}
                </button>
              </div>
            </>
          ) : (
            <div className="interaction-title">
              {body.title ? renderInteractionText(locale, body.title) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
