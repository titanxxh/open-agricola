import type { ActionChoiceOption } from '../game/types'
import type { FarmTilePosition, GameState } from '../game/types'

export type PendingChoice = {
  promptKey?: string
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
  zones: {
    id: string
    zoneType: 'pasture' | 'house' | 'stable'
    animalType: 'sheep' | 'boar' | 'cattle' | null
    animalCount: number
  }[]
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
