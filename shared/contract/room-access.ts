export type RoomAccess =
  | { kind: 'public' }
  | { kind: 'invited'; invitedUserIds: readonly string[] }

export type RoomAccessErrorCode = 'invalid_room_access' | 'invited_player_unavailable'

export type InvitablePlayer = { id: string; username: string; displayName: string }
