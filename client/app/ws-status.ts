import type { CommandErrorCode } from '../../shared/contract/protocol/commands'
import type { GameContextErrorCode } from '../../shared/contract/protocol/game-context'

export type WsErrorCode = GameContextErrorCode | CommandErrorCode | 'seat_replaced' | 'history_branch_changed'

export type WsStatus =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'reconnecting' }
  | { phase: 'creating' }
  | { phase: 'joining'; roomId: string }
  | { phase: 'waiting'; roomId: string; players: Array<{ playerIndex: number; name: string }>; maxPlayers: number }
  | { phase: 'ready'; roomId: string; playerIndex: number; hotseat?: boolean }
  | { phase: 'error'; message: string; code?: WsErrorCode }
