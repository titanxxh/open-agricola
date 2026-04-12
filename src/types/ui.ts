import type { ActionChoiceOption } from '../../shared/game/types'
import type { FarmTilePosition, GameState, InteractionAnimalReorgZone } from '../../shared/game/types'

export type PendingChoice = {
  promptKey?: string
  promptParams?: Record<string, unknown>
  options: ActionChoiceOption[]
  playerIndex: number
  spaceId: string
  fenceExtraWood?: number
}

export type PendingAnimalReorg = {
  playerIndex: number
  spaceId: string
}

export type AnimalReorgState = {
  zones: InteractionAnimalReorgZone[]
  confirmDiscard: boolean
}

export type EngineSnapshot = {
  nodeStates: {
    id: string
    state: 'ready' | 'resolved' | 'blocked'
    active?: boolean
  }[]
  pendingChoiceNodeId: string | null
  pendingChoiceActionId: string | null
  choiceData: {
    id: string
    promptKey?: string
    choices: ActionChoiceOption[]
  } | null
}

export type HistorySnapshot = {
  state: GameState
  pendingNextPlayerIndex: number | null
  pendingChoice: PendingChoice | null
  pendingAnimalReorg: PendingAnimalReorg | null
  animalReorg: AnimalReorgState | null
  actionStartSnapshot: GameState | null
  pendingFenceEdges: string[]
  fenceError: { code: string; edges: string[]; newEdges: string[] } | null
  pendingRoomTiles: FarmTilePosition[]
  roomError: string | null
  pendingStableTiles: FarmTilePosition[]
  stableError: string | null
  pendingPlowTile: FarmTilePosition | null
  plowError: string | null
  pendingSowSelections: Record<string, 'grain' | 'vegetable'>
  sowError: string | null
  engineSnapshot: EngineSnapshot | null
  engineActionId: string | null
}
