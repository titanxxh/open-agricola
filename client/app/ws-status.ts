import type { TeamWaitingRoomState } from '../../shared/contract/team-room'
import type { ServerEvent, RoomViewer, SpectatingEndReason } from '../../shared/contract/protocol/ws'

export type WsErrorCode = NonNullable<Extract<ServerEvent, { type: 'error' }>['code']>

export type WsStatus =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'reconnecting' }
  | { phase: 'creating' }
  | { phase: 'joining'; roomId: string }
  | ({ phase: 'team-waiting' } & TeamWaitingRoomState)
  | { phase: 'waiting'; roomId: string; players: Extract<ServerEvent, { type: 'roomJoined' }>['players']; maxPlayers: number; playerColors: Extract<ServerEvent, { type: 'roomJoined' }>['playerColors']; colorConfirmationPlayerIndex?: number }
  | { phase: 'ready'; roomId: string; viewer: RoomViewer; hotseat?: boolean; spectatingEndReason?: SpectatingEndReason }
  | { phase: 'error'; message: string; code?: WsErrorCode }
