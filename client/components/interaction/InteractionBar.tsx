import { useState, type ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { AnimalKey } from '../../../shared/contract/animals'
import type { AnimalReorgState, PendingChoice, PendingAnimalReorg } from '../../types/ui'
import { ResourceLine } from '../common/ResourceLine'
import { ResourceText } from '../common/ResourceText'
import { formatAnimalCounts } from '../../utils/format'
import type {
  ActionChoiceOption,
  AnytimeAction,
  ChoiceDescriptionPreview,
  ChoiceEffectPreview,
  PaymentResourceMap,
  PlayerState,
  Resource,
} from '../../../shared/contract/types'
import { AnytimeBar } from './AnytimeBar'
import { getAnyCardDisplayName, translateCardText } from '../common/cardText'
import { ResourceQuantitySelectPanel } from './ResourceQuantitySelectPanel'
import { ResourceBatchExchangePanel } from './ResourceBatchExchangePanel'

type ResourceExchangeLabelParams = {
  resourcesPaid?: PaymentResourceMap
  resourcesGained?: Partial<Resource>
  bonusVp?: number
}

type BorrowedFenceSourceControls = {
  donors: {
    playerId: string
    name: string
    color: PlayerState['color']
    cap: number
    allocated: number
  }[]
  selectedPlayerId: string | null
  onSelect: (playerId: string) => void
  hasMissingSources: boolean
}

type HeatingPending = {
  playerName: string
  required: number
  maxFuelPayable: number
  maxWoodConvertibleToFuel: number
}

const emptyAnimalCounts: Record<AnimalKey, number> = { sheep: 0, boar: 0, cattle: 0, horse: 0 }
const animalCountOrder: AnimalKey[] = ['sheep', 'boar', 'cattle', 'horse']

const clampWhole = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))

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
  isInteractive,
  onConfirm,
}: {
  locale: Locale
  pending: HeatingPending
  isInteractive: boolean
  onConfirm: (payload: { fuelUsed: number; woodToFuel: number }) => void
}) => {
  const [woodToFuel, setWoodToFuel] = useState(0)
  const [fuelUsed, setFuelUsed] = useState(Math.min(pending.required, pending.maxFuelPayable))
  const maxWood = pending.maxWoodConvertibleToFuel
  const maxFuel = Math.min(pending.required, pending.maxFuelPayable + woodToFuel)
  const commit = () => {
    onConfirm({
      woodToFuel: clampWhole(woodToFuel, 0, maxWood),
      fuelUsed: clampWhole(fuelUsed, 0, maxFuel),
    })
  }
  return (
    <>
      <div className="interaction-title">
        {t(locale, 'ui.harvestHeatingTitle')}
      </div>
      <div className="interaction-subtitle">
        {t(locale, 'ui.harvestHeatingSubtitle', {
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
          <button onClick={commit} disabled={!isInteractive}>
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
        {hasPositiveResources(effectPreview.resourcesPaid) ? (
          <ResourceLine
            locale={locale}
            mode="payment"
            resources={effectPreview.resourcesPaid ?? {}}
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
): ReactNode => {
  const label = translateCardText(
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
      <span className="interaction-option-subtitle">{renderResourceAwareText(label)}</span>
    </span>
  )
}

const renderDescriptionPreview = (
  locale: Locale,
  preview: ChoiceDescriptionPreview,
): ReactNode => {
  if (preview.kind === 'action') return renderDescriptionAction(locale, preview)
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
          {renderDescriptionPreview(locale, option.descriptionPreview)}
        </span>
      </span>
    )
  }
  if (!option.effectPreview) {
    return renderOptionLabel(locale, option)
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

const getOptionalActionName = (
  locale: Locale,
  option: ActionChoiceOption | undefined,
): string | null => {
  if (!option) return null
  switch (option.effectPreview?.kind) {
    case 'payment':
      return translateCardText(locale, 'actions.pay.name')
    case 'resourceExchange':
      return t(locale, 'ui.interactionResourceExchange')
    default:
      break
  }
  if (option.descriptionPreview?.kind === 'action') {
    return translateCardText(
      locale,
      option.descriptionPreview.labelKey,
      option.descriptionPreview.labelParams as Record<string, string | number> | undefined,
    )
  }
  return translateCardText(
    locale,
    option.labelKey,
    option.labelParams as Record<string, string | number> | undefined,
  )
}

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
  pendingAnimalReorg: PendingAnimalReorg | null
  pendingChoice: PendingChoice | null
  pendingEngineBlocked: {
    promptKey?: string
    promptParams?: Record<string, unknown>
  } | null
  pendingNextPlayerIndex: number | null
  pendingPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  locale: Locale
  playerNames: string[]
  pendingRoomTilesLength: number
  maxRoomSelections: number
  pendingFenceEdgesLength?: number
  pendingStableTilesLength: number
  maxStableSelections: number
  pendingFarmHandSelected?: boolean
  pendingSowSelectionsLength?: number
  pendingPositionSelectionsLength: number
  maxPositionSelections: number
  hasPendingPlowSelection: boolean
  fenceErrorText: string
  roomErrorText: string
  stableErrorText: string
  plowErrorText: string
  sowErrorText: string
  isSelectingFences: boolean
  isSelectingRooms: boolean
  isSelectingStables: boolean
  isSelectingPlow: boolean
  isSelectingSow: boolean
  isInteractive: boolean
  resolveChoice: (value: string) => void
  confirmNextPlayer: () => void
  confirmPlayerSwitch: () => void
  harvestFeedPlayerName: string | null
  confirmHarvestFeed: () => void
  heatingPending?: HeatingPending | null
  confirmHeating?: (payload: { fuelUsed: number; woodToFuel: number }) => void
  onUndo: () => void
  onUndoAction: () => void
  canUndoStep: boolean
  canUndoAction: boolean
  onShowScoring: () => void
  historyLength: number
  hasActionStartSnapshot: boolean
  anytimeActions: AnytimeAction[]
  takeAnytimeAction: (actionId: string) => void
  suppressChoiceOptions?: boolean
  canBuildPalisades?: boolean
  fencePlacementMode?: 'fence' | 'palisade'
  setFencePlacementMode?: (mode: 'fence' | 'palisade') => void
  borrowedFenceSources?: BorrowedFenceSourceControls
  animalReorg?: AnimalReorgState | null
  reorgRemaining?: Record<AnimalKey, number> | null
  hasReorgOverflow?: boolean
  confirmAnimalReorg?: () => void
  cancelAnimalDiscardPrompt?: () => void
  resourceQuantitySelect?: {
    availableByResource: Partial<Record<keyof Resource, number>>
    promptKey?: string
    requireAtLeastOne?: boolean
    onConfirm: (counts: Partial<Record<keyof Resource, number>>) => void
    onCancel: () => void
  } | null
  resourceBatchExchangeSelect?: {
    discardAvailableByResource: Partial<Record<keyof Resource, number>>
    receiveResources: readonly (keyof Resource)[]
    maxTotal: number
    promptKey?: string
    onConfirm: (payload: {
      discard: Partial<Record<keyof Resource, number>>
      receive: Partial<Record<keyof Resource, number>>
    }) => void
    onCancel: () => void
  } | null
}

export const InteractionBar = ({
  pendingAnimalReorg,
  pendingChoice,
  pendingEngineBlocked,
  pendingNextPlayerIndex,
  pendingPlayerSwitch,
  locale,
  playerNames,
  pendingRoomTilesLength,
  maxRoomSelections,
  pendingFenceEdgesLength = 0,
  pendingStableTilesLength,
  maxStableSelections,
  pendingFarmHandSelected = false,
  pendingSowSelectionsLength,
  pendingPositionSelectionsLength,
  maxPositionSelections,
  hasPendingPlowSelection,
  fenceErrorText,
  roomErrorText,
  stableErrorText,
  plowErrorText,
  sowErrorText,
  isSelectingFences,
  isSelectingRooms,
  isSelectingStables,
  isSelectingPlow,
  isSelectingSow,
  isInteractive,
  resolveChoice,
  confirmNextPlayer,
  confirmPlayerSwitch,
  harvestFeedPlayerName,
  confirmHarvestFeed,
  heatingPending = null,
  confirmHeating = () => {},
  onUndo,
  onUndoAction,
  canUndoStep,
  canUndoAction,
  onShowScoring,
  historyLength,
  hasActionStartSnapshot,
  anytimeActions,
  takeAnytimeAction,
  suppressChoiceOptions = false,
  canBuildPalisades = false,
  fencePlacementMode = 'fence',
  setFencePlacementMode,
  borrowedFenceSources,
  animalReorg = null,
  reorgRemaining = null,
  hasReorgOverflow = false,
  confirmAnimalReorg = () => {},
  cancelAnimalDiscardPrompt = () => {},
  resourceQuantitySelect = null,
  resourceBatchExchangeSelect = null,
}: Props) => {
  const isFarmSelectionPrompt =
    pendingChoice?.promptKey === 'ui.interactionFenceSelect' ||
    pendingChoice?.promptKey === 'ui.interactionRoomSelect' ||
    pendingChoice?.promptKey === 'ui.interactionStableSelect' ||
    pendingChoice?.promptKey === 'ui.interactionPlowSelect' ||
    pendingChoice?.promptKey === 'ui.interactionSowSelect' ||
    pendingChoice?.promptKey === 'ui.interactionSelection'
  const visibleOptions =
    pendingChoice?.promptKey === 'ui.interactionPlowSelect' && hasPendingPlowSelection
      ? pendingChoice.options.filter((option) => option.value === 'confirm')
      : isFarmSelectionPrompt
        ? (pendingChoice?.options ?? []).filter((option) => option.value !== 'cancel')
        : pendingChoice?.options ?? []
  const isRoomConfirmDisabled =
    pendingChoice?.promptKey === 'ui.interactionRoomSelect' &&
    pendingRoomTilesLength === 0
  const isStableConfirmDisabled =
    pendingChoice?.promptKey === 'ui.interactionStableSelect' &&
    pendingStableTilesLength === 0 &&
    !pendingFarmHandSelected
  const isFenceConfirmDisabled =
    pendingChoice?.promptKey === 'ui.interactionFenceSelect' &&
    pendingFenceEdgesLength === 0
  const isSelectionConfirmDisabled =
    pendingChoice?.promptKey === 'ui.interactionSelection' &&
    pendingPositionSelectionsLength < ((pendingChoice.promptParams?.minSelections as number | undefined) ?? 1)
  const hasBodyContent = !!(
    pendingAnimalReorg ||
    resourceBatchExchangeSelect ||
    resourceQuantitySelect ||
    heatingPending ||
    harvestFeedPlayerName ||
    (pendingEngineBlocked && isInteractive) ||
    (pendingChoice && isInteractive) ||
    (pendingPlayerSwitch && isInteractive) ||
    (pendingNextPlayerIndex !== null && isInteractive) ||
    !isInteractive
  )
  const triggerCardName =
    pendingChoice?.sourceCard
      ? getAnyCardDisplayName(locale, pendingChoice.sourceCard)
      : null
  const promptHintKey =
    typeof pendingChoice?.promptParams?.hintKey === 'string'
      ? pendingChoice.promptParams.hintKey
      : null
  const isOptionalActionPrompt = pendingChoice?.promptKey === 'ui.interactionOptionalAction'
  const optionalActionOption = isOptionalActionPrompt
    ? visibleOptions.find((option) => !isSkipChoiceOption(option))
    : undefined
  const optionalActionName = getOptionalActionName(locale, optionalActionOption)
  const interactionTitle =
    isOptionalActionPrompt && optionalActionName
      ? t(locale, 'ui.interactionOptionalActionWithChoice', { action: optionalActionName })
      : t(
          locale,
          pendingChoice?.promptKey ?? 'ui.interactionChooseOne',
          pendingChoice?.promptParams as Record<string, string | number> | undefined,
        )
  const stableSelectedCount = pendingStableTilesLength + (pendingFarmHandSelected ? 1 : 0)
  const stableMaxLabel = pendingFarmHandSelected
    ? `${maxStableSelections}+`
    : maxStableSelections

  return (
    <div className="interaction-bar">
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
      {hasBodyContent ? (
        <div className="interaction-bar__body">
          {pendingAnimalReorg ? (
            <>
              <div className="interaction-title">
                {t(locale, 'ui.interactionReorgAnimalsTitle')}
              </div>
              <div className="interaction-subtitle">
                {t(locale, 'ui.interactionReorgAnimalsSubtitle')}
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
                      <button onClick={confirmAnimalReorg} disabled={!isInteractive}>
                        {t(locale, 'ui.reorgDiscardConfirm')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="interaction-actions">
                    <button onClick={confirmAnimalReorg} disabled={!isInteractive || hasReorgOverflow}>
                      {t(locale, 'ui.reorgConfirm')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : resourceBatchExchangeSelect ? (
            <ResourceBatchExchangePanel
              locale={locale}
              discardAvailableByResource={resourceBatchExchangeSelect.discardAvailableByResource}
              receiveResources={resourceBatchExchangeSelect.receiveResources}
              maxTotal={resourceBatchExchangeSelect.maxTotal}
              promptKey={resourceBatchExchangeSelect.promptKey}
              onConfirm={resourceBatchExchangeSelect.onConfirm}
              onCancel={resourceBatchExchangeSelect.onCancel}
            />
          ) : resourceQuantitySelect ? (
            <ResourceQuantitySelectPanel
              locale={locale}
              availableByResource={resourceQuantitySelect.availableByResource}
              promptKey={resourceQuantitySelect.promptKey}
              requireAtLeastOne={resourceQuantitySelect.requireAtLeastOne}
              onConfirm={resourceQuantitySelect.onConfirm}
              onCancel={resourceQuantitySelect.onCancel}
            />
          ) : heatingPending ? (
            <HeatingPanel
              key={`${heatingPending.playerName}:${heatingPending.required}:${heatingPending.maxFuelPayable}:${heatingPending.maxWoodConvertibleToFuel}`}
              locale={locale}
              pending={heatingPending}
              isInteractive={isInteractive}
              onConfirm={confirmHeating}
            />
          ) : harvestFeedPlayerName ? (
            <>
              <div className="interaction-title">
                {t(locale, 'ui.harvestFeedTitle')}
              </div>
              <div className="interaction-subtitle">
                {harvestFeedPlayerName}
              </div>
              <div className="interaction-actions">
                <button onClick={confirmHarvestFeed} disabled={!isInteractive}>
                  {t(locale, 'ui.interactionConfirmButton')}
                </button>
              </div>
            </>
          ) : pendingEngineBlocked && isInteractive ? (
            <div className="interaction-title">
              {t(
                locale,
                pendingEngineBlocked.promptKey ?? 'ui.interactionChooseOne',
                pendingEngineBlocked.promptParams as Record<string, string | number> | undefined,
              )}
            </div>
          ) : pendingChoice && isInteractive ? (
            <>
              <div className="interaction-title">
                {interactionTitle}
              </div>
              {triggerCardName ? (
                <div className="interaction-subtitle">
                  {t(locale, 'ui.interactionTriggeredByCard', { card: triggerCardName })}
                </div>
              ) : null}
              {promptHintKey ? (
                <div className="interaction-rule-hint">
                  {t(locale, promptHintKey)}
                </div>
              ) : null}
              {pendingChoice.promptKey === 'ui.interactionRoomSelect' ? (
                <div className="interaction-subtitle">
                  {t(locale, 'ui.interactionRoomSelectSubtitle', {
                    selected: pendingRoomTilesLength,
                    max: maxRoomSelections,
                  })}
                </div>
              ) : null}
              {pendingChoice.promptKey === 'ui.interactionStableSelect' ? (
                <div className="interaction-subtitle">
                  {t(locale, 'ui.interactionStableSelectSubtitle', {
                    selected: stableSelectedCount,
                    max: stableMaxLabel,
                  })}
                </div>
              ) : null}
              {pendingChoice.promptKey === 'ui.interactionStableSelect' &&
              pendingFarmHandSelected ? (
                <div className="interaction-subtitle interaction-farmhand-hint">
                  {t(locale, 'ui.interactionFarmHandHint')}
                </div>
              ) : null}
              {pendingChoice.promptKey === 'ui.interactionSowSelect' ? (
                <div className="interaction-subtitle">
                  {t(locale, 'ui.interactionSowSelectSubtitle', {
                    selected: pendingSowSelectionsLength ?? 0,
                  })}
                </div>
              ) : null}
              {pendingChoice.promptKey === 'ui.interactionSelection' ? (
                <div className="interaction-subtitle">
                  {t(locale, 'ui.interactionSelectionSubtitle', {
                    selected: pendingPositionSelectionsLength,
                    max: maxPositionSelections,
                  })}
                </div>
              ) : null}
              {isSelectingFences && borrowedFenceSources ? (
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
              {isSelectingFences && canBuildPalisades && setFencePlacementMode && !borrowedFenceSources ? (
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
              {isSelectingFences && fenceErrorText ? (
                <div className="interaction-error">{fenceErrorText}</div>
              ) : null}
              {isSelectingFences && borrowedFenceSources?.hasMissingSources ? (
                <div className="interaction-error">
                  {t(locale, 'ui.borrowedFenceSourceMissing')}
                </div>
              ) : null}
              {isSelectingRooms && roomErrorText ? (
                <div className="interaction-error">{roomErrorText}</div>
              ) : null}
              {isSelectingStables && stableErrorText ? (
                <div className="interaction-error">{stableErrorText}</div>
              ) : null}
              {isSelectingPlow && plowErrorText ? (
                <div className="interaction-error">{plowErrorText}</div>
              ) : null}
              {isSelectingSow && sowErrorText ? (
                <div className="interaction-error">{sowErrorText}</div>
              ) : null}
              {suppressChoiceOptions ? null : ((pendingChoice.promptParams?.needed as number) ?? 0) > 1 ? (
                <CollectorMultiSelect
                  locale={locale}
                  options={visibleOptions}
                  needed={(pendingChoice.promptParams?.needed as number) ?? 6}
                  resolveChoice={resolveChoice}
                  isInteractive={isInteractive}
                />
              ) : pendingChoice.promptKey === 'ui.interactionBakeBreadChoice' ? null : (
                <div className="interaction-actions">
                  {visibleOptions.map((option) => {
                    const isDisabled =
                      !!option.disabled ||
                      !isInteractive ||
                      (pendingChoice.promptKey === 'ui.interactionRoomSelect' &&
                        option.value === 'confirm' &&
                        isRoomConfirmDisabled) ||
                      (pendingChoice.promptKey === 'ui.interactionFenceSelect' &&
                        option.value === 'confirm' &&
                        (isFenceConfirmDisabled || !!borrowedFenceSources?.hasMissingSources)) ||
                      (pendingChoice.promptKey === 'ui.interactionStableSelect' &&
                        option.value === 'confirm' &&
                        isStableConfirmDisabled) ||
                      (pendingChoice.promptKey === 'ui.interactionPlowSelect' &&
                        option.value === 'confirm' &&
                        !hasPendingPlowSelection) ||
                      (pendingChoice.promptKey === 'ui.interactionSowSelect' &&
                        option.value === 'confirm' &&
                        (pendingSowSelectionsLength ?? 0) === 0) ||
                      (pendingChoice.promptKey === 'ui.interactionSelection' &&
                        option.value === 'confirm' &&
                        isSelectionConfirmDisabled)
                    const disabledTitle =
                      option.disabled && option.disabledReasonKey
                        ? t(locale, option.disabledReasonKey)
                        : undefined
                    return (
                      <button
                        key={option.value}
                        disabled={isDisabled}
                        title={disabledTitle}
                        className={option.disabled ? 'choice-option-disabled' : undefined}
                        onClick={() => {
                          if (option.disabled) return
                          resolveChoice(option.value)
                        }}
                      >
                        {renderChoiceOptionContent({
                          locale,
                          option,
                          isOptionalActionPrompt,
                          optionalActionName,
                          triggerCardName,
                        })}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : pendingPlayerSwitch && isInteractive ? (
            <>
              <div className="interaction-title">
                {t(locale, 'ui.interactionPlayerSwitchPrompt', {
                  player: playerNames[pendingPlayerSwitch.toPlayerIndex] ?? `Player ${pendingPlayerSwitch.toPlayerIndex + 1}`,
                })}
              </div>
              <div className="interaction-actions">
                <button onClick={confirmPlayerSwitch} disabled={!isInteractive}>
                  {t(locale, 'ui.interactionPlayerSwitchConfirm')}
                </button>
              </div>
            </>
          ) : pendingNextPlayerIndex !== null && isInteractive ? (
            <>
              <div className="interaction-title">
                {t(locale, 'ui.interactionConfirmNext')}
              </div>
              <div className="interaction-actions">
                <button onClick={confirmNextPlayer} disabled={!isInteractive}>
                  {t(locale, 'ui.interactionConfirmSwitch')}
                </button>
              </div>
            </>
          ) : (
            <div className="interaction-title">
              {t(locale, 'ui.statusWaiting')}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
