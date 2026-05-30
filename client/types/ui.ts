import type { ActionChoiceOption } from '../../shared/contract/types'
import type { FarmTilePosition, GameState, InteractionAnimalReorgZone } from '../../shared/contract/types'

export type PendingChoice = {
  promptKey?: string
  promptParams?: Record<string, unknown>
  options: ActionChoiceOption[]
  playerIndex: number
  spaceId: string
  fenceExtraWood?: number
  sourceCard?: string
}

export type PendingAnimalReorg = {
  playerIndex: number
  spaceId: string
}

export type AnimalReorgState = {
  zones: InteractionAnimalReorgZone[]
  confirmDiscard: boolean
}

export type PendingSowCrop = 'grain' | 'vegetable' | 'wood' | 'stone'

export type ExtraSowTarget = {
  key: string
  tile: FarmTilePosition
  allowedCrops: PendingSowCrop[]
  sourceCard?: string
  groupKey?: string
}

export type EngineSnapshot = {
  nodeStates: {
    id: string
    state: 'ready' | 'resolved' | 'blocked'
    active?: boolean
  }[]
  pendingChoiceNodeId: string | null
  pendingChoiceActionId: string | null
}

export type HistorySnapshot = {
  state: GameState
  pendingNextPlayerIndex: number | null
  pendingChoice: PendingChoice | null
  pendingAnimalReorg: PendingAnimalReorg | null
  animalReorg: AnimalReorgState | null
  actionStartSnapshot: GameState | null
  pendingFenceEdges: string[]
  pendingPalisadeEdges: string[]
  fencePlacementMode: 'fence' | 'palisade'
  fenceError: { code: string; edges: string[]; newEdges: string[] } | null
  pendingRoomTiles: FarmTilePosition[]
  roomError: string | null
  pendingStableTiles: FarmTilePosition[]
  pendingFarmHand: FarmTilePosition | null
  stableError: string | null
  pendingPlowTile: FarmTilePosition | null
  plowError: string | null
  pendingSowSelections: Record<string, PendingSowCrop>
  sowError: string | null
  engineSnapshot: EngineSnapshot | null
  engineActionId: string | null
}
