import type { StateUpdateEnvelope } from './game'
import type { DraftMode, DraftPickPayload } from '../../draft/types'
import type { ParentSelectionSubmission, Resource, ResourceBatchExchangePayload } from '../types'

type CommitSelectionPayload = {
  cancel?: boolean
  positions?: { row: number; col: number }[]
  cardIds?: string[]
  resourceCounts?: Partial<Record<keyof Resource, number>>
  resourceBatchExchange?: ResourceBatchExchangePayload
  edges?: string[]
  palisadeEdges?: string[]
  extraWood?: number
  fenceSources?: Record<string, string>
  rooms?: { row: number; col: number }[]
  stables?: { row: number; col: number }[]
  farmHand?: { row: number; col: number }
  tile?: { row: number; col: number }
  crops?: { row: number; col: number; crop: 'grain' | 'vegetable' | 'wood' | 'stone' }[]
}

type ClientCommandBody =
  | { type: 'auth'; token: string }
  | { type: 'action'; spaceId: string }
  | { type: 'choice'; value: string; payload?: Record<string, unknown> }
  | { type: 'anytime'; actionId: string }
  | {
      type: 'commitSelection'
      playerIndex: number
      payload: CommitSelectionPayload
    }
  | { type: 'roundEnd' }
  | { type: 'parentSubmit'; playerIndex: number; selection: ParentSelectionSubmission }
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
  | {
      type: 'createRoom'
      maxPlayers?: number
      name?: string
      customCardIds?: string[]
      /** When true, include community-deck cards in the deal pool. Default false. */
      enableCommunityDeck?: boolean
      /** When true, start the Parent Cards expansion selection phase before play. Default false. */
      enableParentCards?: boolean
      /** Optional simultaneous card-draft. Absent / 'none' keeps classic hand-deal behaviour. */
      draftMode?: DraftMode
      /** Pool size per card type (7..10). Only applied when draftMode === 'simultaneous'. */
      draftPoolSize?: number
    }
  | { type: 'joinRoom'; roomId: string; name?: string; requestedPlayerIndex?: number }
  | { type: 'dissolveRoom' }
  | { type: 'draftSubmit'; playerId: string; pick: DraftPickPayload }

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
