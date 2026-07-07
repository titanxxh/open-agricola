import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type {
  FarmTilePosition,
  InteractionAnimalReorgZone,
  ActionChoiceOption,
  InteractionFarmSelection,
  InteractionRequest,
  InteractionSelection,
  InteractionState,
  Resource,
  ResourceBatchExchangePayload,
} from '../../shared/contract/types'
import { parsePositionKey } from '../../shared/domain/farm'
import type { PendingChoice } from '../types/ui'
import { buildFenceCommitPayload, buildStableCommitPayload } from './farm-commit-ui'
import {
  buildPendingMoorSpecialActionChoiceMaps,
  type FarmCommitType,
  type PendingMoorSpecialActionChoiceMaps,
} from './game-container-helpers'

type WaitInteraction = Extract<InteractionState, { stateId: 'wait' }>
type FarmSelectionByType<T extends InteractionFarmSelection['farmType']> =
  Extract<InteractionFarmSelection, { farmType: T }>
type FarmPositionSelection = Extract<InteractionSelection, { kind: 'farm-position' }>
type OccupationHandSelection = Extract<InteractionSelection, { kind: 'occupation-hand' }>
type CardDraftRequest = Extract<InteractionRequest, { kind: 'card-draft' }>
type ResourceQuantityRequest = Extract<InteractionRequest, { kind: 'resource-quantity-select' }>
type ResourceBatchExchangeRequest = Extract<InteractionRequest, { kind: 'resource-batch-exchange-select' }>
type SelectionRequest = Extract<InteractionRequest, { kind: 'selection' }>

export type InteractionPresentationPlan =
  | { kind: 'none' }
  | {
      kind: 'farm-fence-selection'
      farm: FarmSelectionByType<'fence'>
      pendingChoice: PendingChoice
    }
  | {
      kind: 'farm-room-selection'
      farm: FarmSelectionByType<'room'>
      pendingChoice: PendingChoice
    }
  | {
      kind: 'farm-stable-selection'
      farm: FarmSelectionByType<'stable'>
      pendingChoice: PendingChoice
    }
  | {
      kind: 'farm-plow-selection'
      farm: FarmSelectionByType<'plow'>
      pendingChoice: PendingChoice
    }
  | {
      kind: 'farm-sow-selection'
      farm: FarmSelectionByType<'sow'>
      pendingChoice: PendingChoice
    }
  | {
      kind: 'position-selection'
      selection: FarmPositionSelection
      pendingChoice: PendingChoice
    }
  | {
      kind: 'occupation-hand-selection'
      selection: OccupationHandSelection
      pendingChoice: PendingChoice
    }
  | {
      kind: 'animal-reorg'
      playerIndex: number
      spaceId: string
    }
  | {
      kind: 'confirm-next-player'
      nextPlayerIndex: number | null
    }
  | {
      kind: 'confirm-player-switch'
      fromPlayerIndex: number
      toPlayerIndex: number
    }
  | {
      kind: 'harvest-feed'
      playerIndex: number
      remaining: number
      foodUsed: number
    }
  | {
      kind: 'heating'
      playerIndex: number
      playerId: string
      required: number
      maxFuelPayable: number
      maxWoodConvertibleToFuel: number
    }
  | {
      kind: 'engine-blocked'
      promptKey: WaitInteraction['promptKey']
      promptParams: WaitInteraction['promptParams']
    }
  | ({
      kind: 'resource-quantity-select'
    } & Pick<ResourceQuantityRequest, 'availableByResource' | 'promptKey' | 'requireAtLeastOne'>)
  | ({
      kind: 'resource-batch-exchange-select'
    } & Pick<ResourceBatchExchangeRequest, 'discardAvailableByResource' | 'receiveResources' | 'maxTotal' | 'promptKey' | 'requireAtLeastOne'>)
  | {
      kind: 'card-draft'
      request: CardDraftRequest
    }
  | {
      kind: 'choice-bar'
      pendingChoice: PendingChoice
      suppressChoiceOptions: boolean
    }
  | {
      kind: 'exchange-center'
      pendingChoice: PendingChoice
    }
  | {
      kind: 'moor-special-action'
      pendingChoice: PendingChoice
      choices: PendingMoorSpecialActionChoiceMaps
      suppressChoiceOptions: true
    }

export type InteractionSubmitDraft = {
  value: string
  animalReorgZones?: readonly InteractionAnimalReorgZone[]
  feedSelections?: readonly InteractionFeedSelection[]
  heatingPayment?: HeatingPayment
  occupationCardIds?: readonly string[]
  resourceCounts?: Partial<Record<keyof Resource, number>>
  resourceBatchExchange?: ResourceBatchExchangePayload
  positionSelectionKeys?: readonly string[]
  fenceEdges?: readonly string[]
  palisadeEdges?: readonly string[]
  fenceSources?: Record<string, string>
  roomTiles?: readonly FarmTilePosition[]
  stableTiles?: readonly FarmTilePosition[]
  farmHand?: FarmTilePosition | null
  plowTile?: FarmTilePosition | null
  sowSelections?: Record<string, 'grain' | 'vegetable' | 'wood' | 'stone'>
}

export type InteractionFeedSelection = {
  count: number
  sourceName?: string
  sourceId: string
  exchangeIndex: number
}

export type HeatingPayment = {
  fuelUsed: number
  woodToFuel: number
}

export type InteractionSubmitCommand =
  | { kind: 'none' }
  | { kind: 'undoStep' }
  | { kind: 'confirmNextPlayer' }
  | { kind: 'confirmPlayerSwitch' }
  | {
      kind: 'confirmFeed'
      playerIndex: number
      selections: InteractionFeedSelection[]
    }
  | {
      kind: 'resolveChoice'
      playerIndex: number
      value: string
      payload?: Record<string, unknown>
    }
  | {
      kind: 'localFarmError'
      farmType: FarmCommitType
      error: string | { code: string; edges: string[]; newEdges: string[] }
    }
  | {
      kind: 'commitSelection'
      playerIndex: number
      payload: Record<string, unknown>
    }

export const interactionChoiceOptions = (interaction: WaitInteraction): ActionChoiceOption[] => {
  if (interaction.request.kind === 'choice') return interaction.request.options
  if (interaction.request.kind === 'select-trigger') return interaction.request.options
  if (interaction.request.kind === 'farm-select') return interaction.request.options ?? []
  if (interaction.request.kind === 'selection') return interaction.request.options ?? []
  return []
}

const farmFromInteraction = (interaction: WaitInteraction): InteractionFarmSelection | null =>
  interaction.request.kind === 'farm-select' ? interaction.request.farm : null

const selectionFromRequest = (request: SelectionRequest): InteractionSelection => request.selection

const pendingChoiceFromInteraction = (interaction: WaitInteraction): PendingChoice => {
  const farm = farmFromInteraction(interaction)
  return {
    promptKey: interaction.promptKey,
    promptParams: interaction.promptParams,
    options: interactionChoiceOptions(interaction),
    playerIndex: interaction.playerIndex,
    spaceId: interaction.spaceId ?? '',
    sourceCard: interaction.sourceCard,
    fenceExtraWood: farm?.farmType === 'fence' ? farm.extraWood ?? 0 : undefined,
  }
}

const isChoiceSurfaceInteraction = (
  interaction: ClientInteractionState,
): interaction is WaitInteraction => (
  isDomainWaitInteraction(interaction) &&
  (interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
)

export const isDomainWaitInteraction = (
  interaction: ClientInteractionState,
): interaction is WaitInteraction => (
  interaction.stateId === 'wait' &&
  interaction.request.kind !== 'private-prompt'
)

export const buildInteractionPresentationPlan = (
  interaction: ClientInteractionState,
): InteractionPresentationPlan => {
  if (!isDomainWaitInteraction(interaction)) return { kind: 'none' }

  const pendingChoice = pendingChoiceFromInteraction(interaction)
  if (interaction.request.kind === 'farm-select') {
    const farm = interaction.request.farm
    if (farm.farmType === 'fence') return { kind: 'farm-fence-selection', farm, pendingChoice }
    if (farm.farmType === 'room') return { kind: 'farm-room-selection', farm, pendingChoice }
    if (farm.farmType === 'stable') return { kind: 'farm-stable-selection', farm, pendingChoice }
    if (farm.farmType === 'plow') return { kind: 'farm-plow-selection', farm, pendingChoice }
    return { kind: 'farm-sow-selection', farm, pendingChoice }
  }
  if (interaction.request.kind === 'selection') {
    const selection = selectionFromRequest(interaction.request)
    if (selection.kind === 'farm-position') {
      return { kind: 'position-selection', selection, pendingChoice }
    }
    return { kind: 'occupation-hand-selection', selection, pendingChoice }
  }
  if (interaction.request.kind === 'animal-reorg') {
    return {
      kind: 'animal-reorg',
      playerIndex: interaction.playerIndex,
      spaceId: interaction.spaceId ?? '',
    }
  }
  if (interaction.request.kind === 'confirm-next-player') {
    return {
      kind: 'confirm-next-player',
      nextPlayerIndex: interaction.request.nextPlayerIndex ?? null,
    }
  }
  if (interaction.request.kind === 'confirm-player-switch') {
    return {
      kind: 'confirm-player-switch',
      fromPlayerIndex: interaction.request.fromPlayerIndex,
      toPlayerIndex: interaction.request.toPlayerIndex,
    }
  }
  if (interaction.request.kind === 'feed') {
    return {
      kind: 'harvest-feed',
      playerIndex: interaction.playerIndex,
      remaining: interaction.request.remaining,
      foodUsed: interaction.request.foodUsed,
    }
  }
  if (interaction.request.kind === 'heating') {
    return {
      kind: 'heating',
      playerIndex: interaction.playerIndex,
      playerId: interaction.request.playerId,
      required: interaction.request.required,
      maxFuelPayable: interaction.request.maxFuelPayable,
      maxWoodConvertibleToFuel: interaction.request.maxWoodConvertibleToFuel,
    }
  }
  if (interaction.request.kind === 'engine-blocked') {
    return {
      kind: 'engine-blocked',
      promptKey: interaction.promptKey,
      promptParams: interaction.promptParams,
    }
  }
  if (interaction.request.kind === 'resource-quantity-select') {
    return {
      kind: 'resource-quantity-select',
      availableByResource: interaction.request.availableByResource,
      promptKey: interaction.request.promptKey,
      requireAtLeastOne: interaction.request.requireAtLeastOne,
    }
  }
  if (interaction.request.kind === 'resource-batch-exchange-select') {
    return {
      kind: 'resource-batch-exchange-select',
      discardAvailableByResource: interaction.request.discardAvailableByResource,
      receiveResources: interaction.request.receiveResources,
      maxTotal: interaction.request.maxTotal,
      promptKey: interaction.request.promptKey,
      requireAtLeastOne: interaction.request.requireAtLeastOne,
    }
  }
  if (interaction.request.kind === 'card-draft') {
    return { kind: 'card-draft', request: interaction.request }
  }
  if (!isChoiceSurfaceInteraction(interaction)) return { kind: 'none' }

  const moorChoices = buildPendingMoorSpecialActionChoiceMaps(pendingChoice.options)
  if (moorChoices.isActive) {
    return {
      kind: 'moor-special-action',
      pendingChoice,
      choices: moorChoices,
      suppressChoiceOptions: true,
    }
  }
  if (pendingChoice.promptKey === 'ui.interactionExchangeChoice') {
    return { kind: 'exchange-center', pendingChoice }
  }
  return {
    kind: 'choice-bar',
    pendingChoice,
    suppressChoiceOptions: false,
  }
}

const positionsFromKeys = (keys: readonly string[] | undefined): FarmTilePosition[] =>
  (keys ?? [])
    .map((key) => parsePositionKey(key))
    .filter((tile): tile is FarmTilePosition => !!tile)

const cropsFromSowSelections = (
  selections: InteractionSubmitDraft['sowSelections'],
): Array<{ row: number; col: number; crop: 'grain' | 'vegetable' | 'wood' | 'stone' }> =>
  Object.entries(selections ?? {})
    .map(([key, crop]) => {
      const tile = parsePositionKey(key)
      return tile ? { row: tile.row, col: tile.col, crop } : null
    })
    .filter((entry): entry is { row: number; col: number; crop: 'grain' | 'vegetable' | 'wood' | 'stone' } => !!entry)

export const buildInteractionSubmitCommand = (
  interaction: ClientInteractionState,
  draft: InteractionSubmitDraft,
): InteractionSubmitCommand => {
  if (interaction.stateId !== 'wait') return { kind: 'none' }
  if (interaction.request.kind === 'confirm-next-player') {
    return { kind: 'confirmNextPlayer' }
  }
  if (interaction.request.kind === 'confirm-player-switch') {
    return { kind: 'confirmPlayerSwitch' }
  }
  if (interaction.request.kind === 'animal-reorg') {
    const zones = [...(draft.animalReorgZones ?? interaction.request.zones)]
    return {
      kind: 'resolveChoice',
      playerIndex: interaction.playerIndex,
      value: draft.value,
      ...(draft.value === 'confirm' ? { payload: { zones } } : {}),
    }
  }
  if (interaction.request.kind === 'feed') {
    if (draft.value === 'confirm') {
      return {
        kind: 'confirmFeed',
        playerIndex: interaction.playerIndex,
        selections: [...(draft.feedSelections ?? [])],
      }
    }
    return {
      kind: 'resolveChoice',
      playerIndex: interaction.playerIndex,
      value: draft.value,
    }
  }
  if (interaction.request.kind === 'heating') {
    return {
      kind: 'resolveChoice',
      playerIndex: interaction.playerIndex,
      value: draft.value,
      ...(draft.heatingPayment ? { payload: draft.heatingPayment } : {}),
    }
  }
  if (interaction.request.kind === 'selection') {
    if (interaction.request.selection.kind === 'occupation-hand') {
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: { cardIds: [...(draft.occupationCardIds ?? [])] },
      }
    }
    if (draft.value === 'cancel') {
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: { cancel: true },
      }
    }
    return {
      kind: 'commitSelection',
      playerIndex: interaction.playerIndex,
      payload: { positions: positionsFromKeys(draft.positionSelectionKeys) },
    }
  }
  if (interaction.request.kind === 'resource-quantity-select') {
    if (draft.value === 'cancel') return { kind: 'undoStep' }
    return {
      kind: 'commitSelection',
      playerIndex: interaction.playerIndex,
      payload: { resourceCounts: draft.resourceCounts ?? {} },
    }
  }
  if (interaction.request.kind === 'resource-batch-exchange-select') {
    if (draft.value === 'cancel') return { kind: 'undoStep' }
    return {
      kind: 'commitSelection',
      playerIndex: interaction.playerIndex,
      payload: { resourceBatchExchange: draft.resourceBatchExchange },
    }
  }
  if (interaction.request.kind === 'farm-select') {
    if (draft.value === 'cancel') {
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: { cancel: true },
      }
    }
    const farm = interaction.request.farm
    if (farm.farmType === 'fence') {
      const fenceEdges = [...(draft.fenceEdges ?? [])]
      const fenceSources = draft.fenceSources ?? {}
      if (
        farm.fenceSource?.kind === 'borrowed' &&
        fenceEdges.some((edgeId) => !fenceSources[edgeId])
      ) {
        return {
          kind: 'localFarmError',
          farmType: 'fence',
          error: {
            code: 'BORROWED_FENCE_SOURCE_REQUIRED',
            edges: fenceEdges,
            newEdges: fenceEdges,
          },
        }
      }
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: buildFenceCommitPayload(
          fenceEdges,
          [...(draft.palisadeEdges ?? [])],
          farm.extraWood ?? 0,
          farm.fenceSource,
          fenceSources,
        ),
      }
    }
    if (farm.farmType === 'room') {
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: { rooms: [...(draft.roomTiles ?? [])] },
      }
    }
    if (farm.farmType === 'stable') {
      const payload = buildStableCommitPayload([...(draft.stableTiles ?? [])], draft.farmHand ?? null)
      if (!payload) return { kind: 'localFarmError', farmType: 'stable', error: 'NO_SELECTION' }
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload,
      }
    }
    if (farm.farmType === 'plow') {
      if (!draft.plowTile) return { kind: 'localFarmError', farmType: 'plow', error: 'NO_SELECTION' }
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: { tile: draft.plowTile },
      }
    }
    if (farm.farmType === 'sow') {
      const crops = cropsFromSowSelections(draft.sowSelections)
      if (crops.length === 0) return { kind: 'localFarmError', farmType: 'sow', error: 'NO_SELECTION' }
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: { crops },
      }
    }
  }
  return { kind: 'none' }
}
