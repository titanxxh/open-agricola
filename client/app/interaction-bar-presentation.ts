import type { AnimalKey } from '../../shared/contract/animals'
import type {
  ActionChoiceOption,
  AnytimeAction,
  PlayerState,
  Resource,
} from '../../shared/contract/types'
import type { Locale } from '../../shared/i18n'
import { t } from '../../shared/i18n'
import { getAnyCardDisplayName, translateCardText } from '../components/common/cardText'
import { getParentFatherOptionText } from '../components/common/parentCardText'
import type { AnimalReorgState, PendingAnimalReorg, PendingChoice } from '../types/ui'

export type BorrowedFenceSourceControls = {
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

export type HeatingPending = {
  playerName: string
  required: number
  maxFuelPayable: number
  maxWoodConvertibleToFuel: number
  isConfirmDisabled?: (payload: { fuelUsed: number; woodToFuel: number }) => boolean
}

export type InteractionBarResourceQuantitySelect = {
  availableByResource: Partial<Record<keyof Resource, number>>
  promptKey?: string
  requireAtLeastOne?: boolean
  isConfirmDisabled?: (counts: Partial<Record<keyof Resource, number>>) => boolean
  onConfirm: (counts: Partial<Record<keyof Resource, number>>) => void
  onCancel: () => void
}

export type InteractionBarResourceBatchExchangeSelect = {
  discardAvailableByResource: Partial<Record<keyof Resource, number>>
  receiveResources: readonly (keyof Resource)[]
  maxTotal: number
  promptKey?: string
  isConfirmDisabled?: (payload: {
    discard: Partial<Record<keyof Resource, number>>
    receive: Partial<Record<keyof Resource, number>>
  }) => boolean
  onConfirm: (payload: {
    discard: Partial<Record<keyof Resource, number>>
    receive: Partial<Record<keyof Resource, number>>
  }) => void
  onCancel: () => void
}

export type InteractionBarPresentationInput = {
  locale: Locale
  playerNames: string[]
  isInteractive: boolean
  pending: {
    animalReorg: PendingAnimalReorg | null
    choice: PendingChoice | null
    engineBlocked: {
      promptKey?: string
      promptParams?: Record<string, unknown>
    } | null
    nextPlayerIndex: number | null
    playerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
    harvestFeedPlayerName: string | null
    harvestFeedConfirmDisabled?: boolean
    nextPlayerConfirmDisabled?: boolean
    playerSwitchConfirmDisabled?: boolean
    heating: HeatingPending | null
    resourceQuantitySelect: InteractionBarResourceQuantitySelect | null
    resourceBatchExchangeSelect: InteractionBarResourceBatchExchangeSelect | null
    suppressChoiceOptions: boolean
  }
  farm: {
    pendingRoomTilesLength: number
    maxRoomSelections: number
    pendingFenceEdgesLength: number
    pendingStableTilesLength: number
    maxStableSelections: number
    pendingFarmHandSelected: boolean
    pendingSowSelectionsLength: number
    pendingPositionSelectionsLength: number
    maxPositionSelections: number
    hasPendingPlowSelection: boolean
    errors: {
      fence: string
      room: string
      stable: string
      plow: string
      sow: string
    }
    selecting: {
      fences: boolean
      rooms: boolean
      stables: boolean
      plow: boolean
      sow: boolean
    }
    fence: {
      canBuildPalisades: boolean
      placementMode: 'fence' | 'palisade'
      setPlacementMode?: (mode: 'fence' | 'palisade') => void
      borrowedSources?: BorrowedFenceSourceControls
    }
  }
  animalReorg: {
    state: AnimalReorgState | null
    remaining: Record<AnimalKey, number> | null
    hasOverflow: boolean
    confirmDisabled?: boolean
  }
  controls: {
    canUndoStep: boolean
    canUndoAction: boolean
    historyLength: number
    hasActionStartSnapshot: boolean
    anytimeActions: AnytimeAction[]
  }
}

export type InteractionBarText = {
  key?: string
  text?: string
  params?: Record<string, string | number>
  className?: string
}

export type InteractionBarBodyKind =
  | 'none'
  | 'animalReorg'
  | 'resourceBatchExchangeSelect'
  | 'resourceQuantitySelect'
  | 'heating'
  | 'harvestFeed'
  | 'engineBlocked'
  | 'choice'
  | 'playerSwitch'
  | 'nextPlayer'
  | 'waiting'

export type InteractionBarBodyModel = {
  kind: InteractionBarBodyKind
  title?: InteractionBarText
  subtitle?: InteractionBarText
}

export type InteractionBarVisibleOption = {
  option: ActionChoiceOption
  disabled: boolean
  disabledTitleKey?: string
}

export type InteractionBarChoiceModel = {
  visibleOptions: InteractionBarVisibleOption[]
  showOptions: boolean
  useCollector: boolean
  collectorNeeded: number
  isOptionalActionPrompt: boolean
  optionalActionName: string | null
  triggerCardName: string | null
  title: InteractionBarText
  triggerSubtitle: InteractionBarText | null
  hint: InteractionBarText | null
  subtitles: InteractionBarText[]
  errors: InteractionBarText[]
  borrowedFenceControlsVisible: boolean
  fenceModeToggleVisible: boolean
}

export type InteractionBarModel = InteractionBarPresentationInput & {
  body: InteractionBarBodyModel
  choice: InteractionBarChoiceModel | null
}

export type InteractionBarActionInput = {
  resolveChoice: (value: string) => void
  confirmNextPlayer: () => void
  confirmPlayerSwitch: () => void
  confirmHarvestFeed: () => void
  confirmHeating: (payload: { fuelUsed: number; woodToFuel: number }) => void
  undoStep: () => void
  undoAction: () => void
  showScoring: () => void
  takeAnytimeAction: (actionId: string) => void
  confirmAnimalReorg: () => void
  cancelAnimalDiscardPrompt: () => void
}

export type InteractionBarActions = InteractionBarActionInput

const textKey = (
  key: string,
  params?: Record<string, string | number>,
  className?: string,
): InteractionBarText => ({
  key,
  ...(params ? { params } : {}),
  ...(className ? { className } : {}),
})

const textValue = (text: string): InteractionBarText => ({ text })

const farmSelectionPrompts = new Set([
  'ui.interactionFenceSelect',
  'ui.interactionRoomSelect',
  'ui.interactionStableSelect',
  'ui.interactionPlowSelect',
  'ui.interactionSowSelect',
  'ui.interactionSelection',
])

const isSkipChoiceOption = (option: ActionChoiceOption) =>
  option.value === '__skip__' || option.labelKey === 'ui.interactionOptionalSkip'

const getOptionalActionName = (
  locale: Locale,
  option: ActionChoiceOption | undefined,
): string | null => {
  if (!option) return null
  const parentLabel = getParentFatherOptionText(locale, option)
  if (parentLabel) return parentLabel
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

const buildBodyModel = (input: InteractionBarPresentationInput): InteractionBarBodyModel => {
  const { pending, isInteractive, playerNames } = input
  if (pending.animalReorg) {
    return {
      kind: 'animalReorg',
      title: textKey('ui.interactionReorgAnimalsTitle'),
      subtitle: textKey('ui.interactionReorgAnimalsSubtitle'),
    }
  }
  if (pending.resourceBatchExchangeSelect) return { kind: 'resourceBatchExchangeSelect' }
  if (pending.resourceQuantitySelect) return { kind: 'resourceQuantitySelect' }
  if (pending.heating) {
    return {
      kind: 'heating',
      title: textKey('ui.harvestHeatingTitle'),
      subtitle: textKey('ui.harvestHeatingSubtitle', {
        player: pending.heating.playerName,
        count: pending.heating.required,
      }),
    }
  }
  if (pending.harvestFeedPlayerName) {
    return {
      kind: 'harvestFeed',
      title: textKey('ui.harvestFeedTitle'),
      subtitle: textValue(pending.harvestFeedPlayerName),
    }
  }
  if (pending.engineBlocked && isInteractive) {
    return {
      kind: 'engineBlocked',
      title: textKey(
        pending.engineBlocked.promptKey ?? 'ui.interactionChooseOne',
        pending.engineBlocked.promptParams as Record<string, string | number> | undefined,
      ),
    }
  }
  if (pending.choice && isInteractive) return { kind: 'choice' }
  if (pending.playerSwitch && isInteractive) {
    return {
      kind: 'playerSwitch',
      title: textKey('ui.interactionPlayerSwitchPrompt', {
        player: playerNames[pending.playerSwitch.toPlayerIndex] ??
          `Player ${pending.playerSwitch.toPlayerIndex + 1}`,
      }),
    }
  }
  if (pending.nextPlayerIndex !== null && isInteractive) {
    return {
      kind: 'nextPlayer',
      title: textKey('ui.interactionConfirmNext'),
    }
  }
  if (!isInteractive) {
    return {
      kind: 'waiting',
      title: textKey('ui.statusWaiting'),
    }
  }
  return { kind: 'none' }
}

const buildChoiceSubtitles = (
  input: InteractionBarPresentationInput,
  choice: PendingChoice,
): InteractionBarText[] => {
  const { farm } = input
  const out: InteractionBarText[] = []
  if (choice.promptKey === 'ui.interactionRoomSelect') {
    out.push(textKey('ui.interactionRoomSelectSubtitle', {
      selected: farm.pendingRoomTilesLength,
      max: farm.maxRoomSelections,
    }))
  }
  if (choice.promptKey === 'ui.interactionStableSelect') {
    const selected = farm.pendingStableTilesLength + (farm.pendingFarmHandSelected ? 1 : 0)
    out.push(textKey('ui.interactionStableSelectSubtitle', {
      selected,
      max: farm.pendingFarmHandSelected ? `${farm.maxStableSelections}+` : farm.maxStableSelections,
    }))
    if (farm.pendingFarmHandSelected) {
      out.push(textKey('ui.interactionFarmHandHint', undefined, 'interaction-farmhand-hint'))
    }
  }
  if (choice.promptKey === 'ui.interactionSowSelect') {
    out.push(textKey('ui.interactionSowSelectSubtitle', {
      selected: farm.pendingSowSelectionsLength,
    }))
  }
  if (choice.promptKey === 'ui.interactionSelection') {
    out.push(textKey('ui.interactionSelectionSubtitle', {
      selected: farm.pendingPositionSelectionsLength,
      max: farm.maxPositionSelections,
    }))
  }
  return out
}

const buildChoiceErrors = (input: InteractionBarPresentationInput): InteractionBarText[] => {
  const { farm } = input
  const out: InteractionBarText[] = []
  if (farm.selecting.fences && farm.errors.fence) out.push(textValue(farm.errors.fence))
  if (farm.selecting.fences && farm.fence.borrowedSources?.hasMissingSources) {
    out.push(textKey('ui.borrowedFenceSourceMissing'))
  }
  if (farm.selecting.rooms && farm.errors.room) out.push(textValue(farm.errors.room))
  if (farm.selecting.stables && farm.errors.stable) out.push(textValue(farm.errors.stable))
  if (farm.selecting.plow && farm.errors.plow) out.push(textValue(farm.errors.plow))
  if (farm.selecting.sow && farm.errors.sow) out.push(textValue(farm.errors.sow))
  return out
}

const buildChoiceModel = (
  input: InteractionBarPresentationInput,
): InteractionBarChoiceModel | null => {
  const choice = input.pending.choice
  if (!choice) return null
  const { farm, locale, isInteractive } = input
  const isFarmSelectionPrompt = !!choice.promptKey && farmSelectionPrompts.has(choice.promptKey)
  const visibleOptions =
    choice.promptKey === 'ui.interactionPlowSelect' && farm.hasPendingPlowSelection
      ? choice.options.filter((option) => option.value === 'confirm')
      : isFarmSelectionPrompt
        ? choice.options.filter((option) => option.value !== 'cancel')
        : choice.options
  const minSelections = (choice.promptParams?.minSelections as number | undefined) ?? 1
  const isRoomConfirmDisabled =
    choice.promptKey === 'ui.interactionRoomSelect' &&
    farm.pendingRoomTilesLength === 0
  const isStableConfirmDisabled =
    choice.promptKey === 'ui.interactionStableSelect' &&
    farm.pendingStableTilesLength === 0 &&
    !farm.pendingFarmHandSelected
  const isFenceConfirmDisabled =
    choice.promptKey === 'ui.interactionFenceSelect' &&
    farm.pendingFenceEdgesLength === 0
  const isSelectionConfirmDisabled =
    choice.promptKey === 'ui.interactionSelection' &&
    farm.pendingPositionSelectionsLength < minSelections
  const isOptionalActionPrompt = choice.promptKey === 'ui.interactionOptionalAction'
  const optionalActionOption = isOptionalActionPrompt
    ? visibleOptions.find((option) => !isSkipChoiceOption(option))
    : undefined
  const optionalActionName = getOptionalActionName(locale, optionalActionOption)
  const triggerCardName = choice.sourceCard
    ? getAnyCardDisplayName(locale, choice.sourceCard)
    : null
  const promptHintKey =
    typeof choice.promptParams?.hintKey === 'string'
      ? choice.promptParams.hintKey
      : null
  const promptCardId =
    typeof choice.promptParams?.cardId === 'string'
      ? choice.promptParams.cardId
      : null
  const titleParams = choice.promptParams as Record<string, string | number> | undefined
  const needed = (choice.promptParams?.needed as number | undefined) ?? 0
  const showOptions =
    !input.pending.suppressChoiceOptions &&
    choice.promptKey !== 'ui.interactionBakeBreadChoice'

  return {
    visibleOptions: visibleOptions.map((option) => ({
      option,
      disabled:
        !!option.disabled ||
        !isInteractive ||
        (choice.promptKey === 'ui.interactionRoomSelect' &&
          option.value === 'confirm' &&
          isRoomConfirmDisabled) ||
        (choice.promptKey === 'ui.interactionFenceSelect' &&
          option.value === 'confirm' &&
          (isFenceConfirmDisabled || !!farm.fence.borrowedSources?.hasMissingSources)) ||
        (choice.promptKey === 'ui.interactionStableSelect' &&
          option.value === 'confirm' &&
          isStableConfirmDisabled) ||
        (choice.promptKey === 'ui.interactionPlowSelect' &&
          option.value === 'confirm' &&
          !farm.hasPendingPlowSelection) ||
        (choice.promptKey === 'ui.interactionSowSelect' &&
          option.value === 'confirm' &&
          farm.pendingSowSelectionsLength === 0) ||
        (choice.promptKey === 'ui.interactionSelection' &&
          option.value === 'confirm' &&
          isSelectionConfirmDisabled),
      ...(option.disabled && option.disabledReasonKey
        ? { disabledTitleKey: option.disabledReasonKey }
        : {}),
    })),
    showOptions,
    useCollector: showOptions && needed > 1,
    collectorNeeded: (choice.promptParams?.needed as number | undefined) ?? 6,
    isOptionalActionPrompt,
    optionalActionName,
    triggerCardName,
    title:
      isOptionalActionPrompt && optionalActionName
        ? textKey('ui.interactionOptionalActionWithChoice', { action: optionalActionName })
        : textKey(
            choice.promptKey ?? 'ui.interactionChooseOne',
            promptCardId
              ? { ...titleParams, card: getAnyCardDisplayName(locale, promptCardId) }
              : titleParams,
          ),
    triggerSubtitle: triggerCardName
      ? textKey('ui.interactionTriggeredByCard', { card: triggerCardName })
      : null,
    hint: promptHintKey ? textKey(promptHintKey) : null,
    subtitles: buildChoiceSubtitles(input, choice),
    errors: buildChoiceErrors(input),
    borrowedFenceControlsVisible: farm.selecting.fences && !!farm.fence.borrowedSources,
    fenceModeToggleVisible:
      farm.selecting.fences &&
      farm.fence.canBuildPalisades &&
      !!farm.fence.setPlacementMode &&
      !farm.fence.borrowedSources,
  }
}

export const buildInteractionBarModel = (
  input: InteractionBarPresentationInput,
): InteractionBarModel => ({
  ...input,
  body: buildBodyModel(input),
  choice: buildChoiceModel(input),
})

export const buildInteractionBarActions = (
  input: InteractionBarActionInput,
): InteractionBarActions => input
