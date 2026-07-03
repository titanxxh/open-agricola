import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type {
  FarmTilePosition,
  InteractionFarmSelection,
  InteractionSelection,
  InteractionState,
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

export type InteractionSubmitCommand =
  | { kind: 'none' }
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

const choiceOptions = (interaction: WaitInteraction) =>
  interaction.options ?? (
    (interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
      ? interaction.request.options
      : []
  )

const pendingChoiceFromInteraction = (interaction: WaitInteraction): PendingChoice => ({
  promptKey: interaction.promptKey,
  promptParams: interaction.promptParams,
  options: choiceOptions(interaction),
  playerIndex: interaction.playerIndex,
  spaceId: interaction.spaceId ?? '',
  sourceCard: interaction.sourceCard,
  fenceExtraWood:
    interaction.farm?.farmType === 'fence'
      ? interaction.farm.extraWood ?? 0
      : undefined,
})

const isChoiceSurfaceInteraction = (
  interaction: ClientInteractionState,
): interaction is WaitInteraction => (
  isDomainWaitInteraction(interaction) &&
  (interaction.request.kind === 'choice' || interaction.request.kind === 'select-trigger')
)

const isDomainWaitInteraction = (
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
  if (interaction.request.kind === 'farm-select' && interaction.farm) {
    const farm = interaction.farm
    if (farm.farmType === 'fence') return { kind: 'farm-fence-selection', farm, pendingChoice }
    if (farm.farmType === 'room') return { kind: 'farm-room-selection', farm, pendingChoice }
    if (farm.farmType === 'stable') return { kind: 'farm-stable-selection', farm, pendingChoice }
    if (farm.farmType === 'plow') return { kind: 'farm-plow-selection', farm, pendingChoice }
    return { kind: 'farm-sow-selection', farm, pendingChoice }
  }
  if (
    interaction.request.kind === 'selection' &&
    interaction.selection?.kind === 'farm-position'
  ) {
    return { kind: 'position-selection', selection: interaction.selection, pendingChoice }
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
  if (interaction.request.kind === 'selection') {
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
  if (interaction.request.kind === 'farm-select' && interaction.farm) {
    if (draft.value === 'cancel') {
      return {
        kind: 'commitSelection',
        playerIndex: interaction.playerIndex,
        payload: { cancel: true },
      }
    }
    const farm = interaction.farm
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
