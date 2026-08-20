import type { StateUpdateEnvelope } from './game'
import type { GameContextErrorCode, GameContextLifecycle } from './game-context'
import type { DraftMode, DraftPickPayload } from '../../draft/types'
import type { ParentSelectionSubmission, Resource, ResourceBatchExchangePayload } from '../types'
import type { MoorSpecialActionId } from '../../moor/types'

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

type MoorSpecialActionPayload = {
  tile?: { row: number; col: number }
}

type ClientCommandBody =
  | { type: 'auth'; token: string }
  | { type: 'action'; spaceId: string }
  | { type: 'specialAction'; cardId: string; actionId: MoorSpecialActionId; payload?: MoorSpecialActionPayload }
  | { type: 'choice'; value: string; payload?: Record<string, unknown> }
  | { type: 'anytime'; actionId: string }
  | { type: 'ordinaryDrawKeep'; playerIndex: number; choiceId: string; keepCardId: string }
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
      /** When false, deal one Parent Card pair directly instead of opening parent selection. Default true. */
      draftParents?: boolean
      /** When true, enable the Through the Seasons game variant. Default false. */
      enableThroughTheSeasons?: boolean
      /** When true, enable the Farmers of the Moor game variant. Default false. */
      enableFarmersOfTheMoor?: boolean
      allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
      /** Optional simultaneous card-draft. Absent / 'none' keeps classic hand-deal behaviour. */
      draftMode?: DraftMode
      /** Pool size per card type (7..10). Only applied when draftMode === 'simultaneous'. */
      draftPoolSize?: number
      /**
       * Local hotseat: one person plays every seat from this connection. The
       * room is hidden from the lobby list and only its creator can rejoin.
       */
      hotseat?: boolean
    }
  | {
      type: 'joinRoom'
      roomId: string
      intent?: 'join' | 'resume'
      name?: string
      requestedPlayerIndex?: number
    }
  | { type: 'dissolveRoom' }
  | { type: 'draftSubmit'; playerId: string; pick: DraftPickPayload }

export type ClientCommand = ClientCommandBody & { requestId?: string }

export type ServerEvent =
  | StateUpdateEnvelope
  | {
      type: 'error'
      error: string
      code?: GameContextErrorCode | 'seat_replaced'
      lifecycle?: GameContextLifecycle
      requestId?: string
    }
  | { type: 'authOk'; userId: string; username: string }
  | { type: 'roomCreated'; roomId: string; playerIndex: number; maxPlayers: number; hotseat?: boolean }
  | {
      type: 'roomJoined'
      roomId: string
      playerIndex: number
      status: 'waiting' | 'playing'
      players: Array<{ playerIndex: number; name: string }>
      maxPlayers: number
      /** One device plays every seat; the client may act for any of them. */
      hotseat?: boolean
    }
  | {
      type: 'roomWaiting'
      roomId: string
      players: Array<{ playerIndex: number; name: string }>
      maxPlayers: number
    }
  | { type: 'gameStarted' }
  | { type: 'playerJoined'; playerIndex: number; name: string; playerCount: number; maxPlayers: number }
  | { type: 'playerDisconnected'; playerIndex: number }
  | { type: 'roomDissolved'; roomId: string; reason?: 'card_takedown' }
  | { type: 'roomPersistencePaused'; roomId: string }
  | { type: 'roomPersistenceResumed'; roomId: string }
  | { type: 'seat_replaced'; roomId: string; playerIndex: number }

export type RoomSummary = {
  id: string
  playerCount: number
  maxPlayers: number
  createdBy?: string
  status?: 'waiting' | 'playing'
}
