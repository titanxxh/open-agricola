import type { AnimalKey } from '../../shared/contract/animals'
import type {
  AnytimeAction,
  PlayerState,
  Resource,
} from '../../shared/contract/types'
import type { Locale } from '../../shared/i18n'
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
}

export type InteractionBarResourceQuantitySelect = {
  availableByResource: Partial<Record<keyof Resource, number>>
  promptKey?: string
  requireAtLeastOne?: boolean
  onConfirm: (counts: Partial<Record<keyof Resource, number>>) => void
  onCancel: () => void
}

export type InteractionBarResourceBatchExchangeSelect = {
  discardAvailableByResource: Partial<Record<keyof Resource, number>>
  receiveResources: readonly (keyof Resource)[]
  maxTotal: number
  promptKey?: string
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
  }
  controls: {
    canUndoStep: boolean
    canUndoAction: boolean
    historyLength: number
    hasActionStartSnapshot: boolean
    anytimeActions: AnytimeAction[]
  }
}

export type InteractionBarModel = InteractionBarPresentationInput

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

export const buildInteractionBarModel = (
  input: InteractionBarPresentationInput,
): InteractionBarModel => input

export const buildInteractionBarActions = (
  input: InteractionBarActionInput,
): InteractionBarActions => input
