import { useState, type ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { PendingChoice, PendingAnimalReorg } from '../../types/ui'
import { ResourceLine } from '../common/ResourceLine'
import type {
  ActionChoiceOption,
  AnytimeAction,
  ChoiceEffectPreview,
  Resource,
} from '../../../shared/game/types'
import { AnytimeBar } from './AnytimeBar'
import { getAnyCardDisplayName, translateCardText } from '../common/cardText'

type ResourceExchangeLabelParams = {
  resourcesPaid?: Partial<Resource>
  resourcesGained?: Partial<Resource>
  bonusVp?: number
}

const isResourceExchangeLabelParams = (
  value: unknown,
): value is ResourceExchangeLabelParams =>
  !!value && typeof value === 'object'

const hasPositiveResources = (resources?: Partial<Resource>) =>
  !!resources && Object.values(resources).some((value) => (value ?? 0) > 0)

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
          <ResourceLine locale={locale} resources={effectPreview.resourcesPaid ?? {}} hideZero />
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
  return effectPreview.text
}

const getEffectPreviewSubtitle = (
  locale: Locale,
  option: ActionChoiceOption,
): ReactNode => {
  switch (option.effectPreview?.kind) {
    case 'payment':
      return translateCardText(locale, 'actions.pay-resources.name')
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
        {Object.keys(option.labelParams.resourcesPaid as Partial<Resource>).filter(k => (option.labelParams?.resourcesPaid as Record<string, number>)[k] > 0).length === 0 ? (
          <span>{t(locale, 'ui.interactionPaymentFree')}</span>
        ) : (
          <ResourceLine locale={locale} resources={option.labelParams.resourcesPaid as Partial<Resource>} hideZero />
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
  return translateCardText(
    locale,
    option.labelKey,
    option.labelParams as Record<string, string | number> | undefined,
  )
}

const renderOptionContent = (
  locale: Locale,
  option: ActionChoiceOption,
): ReactNode => {
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

function CollectorMultiSelect({ locale, options, needed, resolveChoice, isInteractive }: {
  locale: Locale
  options: { value: string; labelKey: string }[]
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
        {options.map((option) => (
          <label key={option.value} className={`collector-option ${selected.has(option.value) ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => toggle(option.value)}
              disabled={!isInteractive || (!selected.has(option.value) && selected.size >= needed)}
            />
            <span className={`res-icon res-icon-${option.value}`} />
            {translateCardText(locale, option.labelKey)}
          </label>
        ))}
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
  pendingNextPlayerIndex: number | null
  pendingPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  locale: Locale
  playerNames: string[]
  pendingRoomTilesLength: number
  maxRoomSelections: number
  pendingStableTilesLength: number
  maxStableSelections: number
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
  onUndo: () => void
  onUndoAction: () => void
  onShowScoring: () => void
  historyLength: number
  hasActionStartSnapshot: boolean
  anytimeActions: AnytimeAction[]
  takeAnytimeAction: (actionId: string) => void
  canBuildPalisades?: boolean
  fencePlacementMode?: 'fence' | 'palisade'
  setFencePlacementMode?: (mode: 'fence' | 'palisade') => void
}

export const InteractionBar = ({
  pendingAnimalReorg,
  pendingChoice,
  pendingNextPlayerIndex,
  pendingPlayerSwitch,
  locale,
  playerNames,
  pendingRoomTilesLength,
  maxRoomSelections,
  pendingStableTilesLength,
  maxStableSelections,
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
  onUndo,
  onUndoAction,
  onShowScoring,
  historyLength,
  hasActionStartSnapshot,
  anytimeActions,
  takeAnytimeAction,
  canBuildPalisades = false,
  fencePlacementMode = 'fence',
  setFencePlacementMode,
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
    pendingStableTilesLength === 0
  const isSelectionConfirmDisabled =
    pendingChoice?.promptKey === 'ui.interactionSelection' &&
    pendingPositionSelectionsLength === 0
  const hasBodyContent = !!(
    pendingAnimalReorg ||
    harvestFeedPlayerName ||
    (pendingChoice && isInteractive) ||
    (pendingPlayerSwitch && isInteractive) ||
    (pendingNextPlayerIndex !== null && isInteractive) ||
    !isInteractive
  )
  const triggerCardName =
    pendingChoice?.sourceCard
      ? getAnyCardDisplayName(locale, pendingChoice.sourceCard)
      : null

  return (
    <div className="interaction-bar">
      <div className="interaction-bar__top">
        <div className="interaction-bar__controls">
          <button onClick={onUndo} disabled={!isInteractive || historyLength === 0}>
            {t(locale, 'ui.undoStep')}
          </button>
          <button onClick={onUndoAction} disabled={!isInteractive || !hasActionStartSnapshot}>
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
            </>
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
          ) : pendingChoice && isInteractive ? (
            <>
              <div className="interaction-title">
                {t(locale, pendingChoice.promptKey as string ?? 'ui.interactionChooseOne')}
              </div>
              {triggerCardName ? (
                <div className="interaction-subtitle">
                  {t(locale, 'ui.interactionTriggeredByCard', { card: triggerCardName })}
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
                    selected: pendingStableTilesLength,
                    max: maxStableSelections,
                  })}
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
              {isSelectingFences && canBuildPalisades && setFencePlacementMode ? (
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
              {pendingChoice.promptKey === 'ui.interactionCollectorSelect' ? (
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
                        {renderOptionContent(locale, option)}
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
