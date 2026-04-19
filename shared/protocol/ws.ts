import type { Resource } from '../game/types'
import type { StateUpdateEnvelope } from './game'

type ClientCommandBody =
  | { type: 'auth'; token: string }
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
      selections: { resourceKey: keyof Resource; count: number; food: number; sourceName?: string; sourceId?: string }[]
    }
  | {
      type: 'commitFarm'
      playerIndex: number
      farmType: 'fence' | 'room' | 'stable' | 'plow' | 'sow'
      payload: Record<string, unknown>
    }
  | {
      type: 'commitSelection'
      playerIndex: number
      payload: {
        positions?: { row: number; col: number }[]
        cardIds?: string[]
      }
    }
  | { type: 'nextPlayer' }
  | { type: 'confirmPlayerSwitch' }
  | { type: 'roundEnd' }
  | { type: 'undoStep' }
  | { type: 'undoAction' }
  | { type: 'newGame'; seed?: number }
  | { type: 'loadGame'; state: unknown }
  | { type: 'devSetResources'; playerIndex: number; resources: Record<string, number> }
  | { type: 'devSetRound'; round: number }
  | { type: 'devDrawCard'; playerIndex: number; cardId: string }
  | { type: 'devPlayCard'; playerIndex: number; cardId: string }
  | { type: 'devCreatePasture'; playerIndex: number }
  | { type: 'getState' }
  | { type: 'createRoom'; maxPlayers?: number; name?: string; customCardIds?: string[] }
  | { type: 'joinRoom'; roomId: string; name?: string; requestedPlayerIndex?: number }
  | { type: 'dissolveRoom' }

export type ClientCommand = ClientCommandBody & { requestId?: string }

export type ServerEvent =
  | StateUpdateEnvelope
  | { type: 'error'; error: string; requestId?: string }
  | { type: 'authOk'; userId: string; username: string }
  | { type: 'roomCreated'; roomId: string; playerIndex: number; maxPlayers: number }
  | { type: 'roomJoined'; roomId: string; playerIndex: number }
  | { type: 'gameStarted' }
  | { type: 'playerJoined'; playerIndex: number; name: string; playerCount: number; maxPlayers: number }
  | { type: 'playerDisconnected'; playerIndex: number }
  | { type: 'roomDissolved'; roomId: string }

export type RoomSummary = {
  id: string
  playerCount: number
  maxPlayers: number
  createdBy?: string
  status?: 'waiting' | 'playing'
}
