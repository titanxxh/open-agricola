import type { ServerEvent } from '../../shared/contract/protocol/ws'

export type WsErrorCode = NonNullable<Extract<ServerEvent, { type: 'error' }>['code']>

export type WsStatus =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'reconnecting' }
  | { phase: 'creating' }
  | { phase: 'joining'; roomId: string }
  | { phase: 'waiting'; roomId: string; players: Array<{ playerIndex: number; name: string }>; maxPlayers: number }
  | { phase: 'ready'; roomId: string; playerIndex: number; hotseat?: boolean }
  | { phase: 'error'; message: string; code?: WsErrorCode }
