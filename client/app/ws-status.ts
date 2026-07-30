import type { GameContextErrorCode } from '../../shared/contract/protocol/game-context'

export type WsErrorCode = GameContextErrorCode | 'seat_replaced'

export type WsStatus =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'creating' }
  | { phase: 'joining'; roomId: string }
  | { phase: 'waiting'; roomId: string; players: Array<{ playerIndex: number; name: string }>; maxPlayers: number }
  | { phase: 'ready'; roomId: string; playerIndex: number }
  | { phase: 'error'; message: string; code?: WsErrorCode }
