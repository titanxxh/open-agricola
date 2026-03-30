import type { Resource } from '../game/types'
import type { StateUpdateEnvelope } from './game'

export type ClientCommand =
  | { type: 'action'; spaceId: string }
  | { type: 'choice'; value: string }
  | { type: 'anytime'; actionId: string }
  | {
      type: 'reorg'
      zones: {
        id: string
        zoneType: 'pasture' | 'house' | 'stable'
        animalType: 'sheep' | 'boar' | 'cattle' | null
        animalCount: number
      }[]
    }
  | {
      type: 'feed'
      selections: { resourceKey: keyof Resource; count: number; food: number; sourceName?: string }[]
    }
  | {
      type: 'commitFarm'
      playerIndex: number
      farmType: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      payload: Record<string, unknown>
    }
  | { type: 'nextPlayer' }
  | { type: 'confirmPlayerSwitch' }
  | { type: 'roundEnd' }
  | { type: 'undoStep' }
  | { type: 'undoAction' }
  | { type: 'newGame'; seed?: number }
  | { type: 'loadGame'; state: unknown }
  | { type: 'devCreatePasture'; playerIndex: number }
  | { type: 'getState' }
  | { type: 'createRoom'; maxPlayers?: number; name?: string }
  | { type: 'joinRoom'; roomId: string; name?: string; requestedPlayerIndex?: number }

export type ServerEvent =
  | StateUpdateEnvelope
  | { type: 'error'; error: string }
  | { type: 'roomCreated'; roomId: string; playerIndex: number }
  | { type: 'roomJoined'; roomId: string; playerIndex: number }
  | { type: 'gameStarted' }
  | { type: 'playerDisconnected'; playerIndex: number }

export type RoomSummary = {
  id: string
  playerCount: number
  maxPlayers: number
}
