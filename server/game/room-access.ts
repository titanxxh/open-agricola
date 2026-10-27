import type { InvitablePlayer, RoomAccess, RoomAccessErrorCode } from '../../shared/contract/room-access'
import type { GameContextError } from '../../shared/contract/protocol/game-context'
import type { PostgresDatabase } from '../database/postgres'

type AccessDatabase = Pick<PostgresDatabase, 'prepare'>
type AccessTarget = { createdBy?: string; access?: RoomAccess }
type AccessResult =
  | { ok: true; access: RoomAccess }
  | { ok: false; code: RoomAccessErrorCode | 'login_required'; error: string }

const eligibleAccount = `(email IS NULL OR email_verified_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id = users.id)`

export async function searchInvitablePlayers(db: AccessDatabase, prefix: string, currentUserId: string): Promise<InvitablePlayer[]> {
  return db.prepare(`SELECT id, username, display_name AS "displayName" FROM users
    WHERE (starts_with(lower(username), lower(?)) OR starts_with(lower(display_name), lower(?)))
      AND id <> ? AND ${eligibleAccount}
    ORDER BY lower(display_name), lower(username), id LIMIT 10`).all<InvitablePlayer>(prefix, prefix, currentUserId)
}

export async function parseRoomAccess(
  input: unknown,
  setup: { creatorId?: string; maxPlayers: number; hotseat: boolean },
  db: AccessDatabase,
): Promise<AccessResult> {
  const invalid = { ok: false, code: 'invalid_room_access', error: 'Choose public access or specify one invited player ID for each other seat' } as const
  if (input === undefined) return { ok: true, access: { kind: 'public' } }
  if (!input || typeof input !== 'object' || !('kind' in input)) return invalid
  if (input.kind === 'public') {
    return 'invitedUserIds' in input ? invalid : { ok: true, access: { kind: 'public' } }
  }
  if (input.kind !== 'invited' || setup.hotseat || !('invitedUserIds' in input)) return invalid
  if (!setup.creatorId) return { ok: false, code: 'login_required', error: 'Sign in to create an invitation-only room' }
  const rawIds: unknown = input.invitedUserIds
  if (!Array.isArray(rawIds) || rawIds.length > 32) return invalid
  const ids: string[] = []
  for (const id of rawIds) {
    if (typeof id !== 'string' || !id.trim() || id.length > 128) return invalid
    ids.push(id.trim())
  }
  const invitedUserIds = [...new Set(ids)].filter(id => id !== setup.creatorId)
  if (invitedUserIds.length !== setup.maxPlayers - 1) return invalid
  const accounts = await db.prepare(`
    SELECT id FROM users
    WHERE id IN (SELECT json_array_elements_text(?::json))
      AND ${eligibleAccount}
  `).all<{ id: string }>(JSON.stringify(invitedUserIds))
  if (accounts.length !== invitedUserIds.length) {
    return { ok: false, code: 'invited_player_unavailable', error: 'An invited player ID was not found or the account is unavailable' }
  }
  return { ok: true, access: { kind: 'invited', invitedUserIds } }
}

export function canAccessRoom(room: AccessTarget, userId?: string): boolean {
  return room.access?.kind !== 'invited'
    || !!userId && (room.createdBy === userId || room.access.invitedUserIds.includes(userId))
}

/** Non-NULL stored policy must never become public after a decode failure. */
export function decodeRoomAccess(value: unknown): RoomAccess | undefined {
  if (value === null) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > 5
    || !value.every((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128)) {
    throw new Error('Invalid stored room access policy')
  }
  return { kind: 'invited', invitedUserIds: value }
}

export async function persistedRoomAccessError(
  db: AccessDatabase,
  roomId: string,
  userId?: string,
): Promise<GameContextError | null> {
  const row = await db.prepare('SELECT created_by, invited_user_ids FROM rooms WHERE id = ?')
    .get<{ created_by: string | null; invited_user_ids: unknown }>(roomId)
  if (!row || canAccessRoom({ createdBy: row.created_by ?? undefined, access: decodeRoomAccess(row.invited_user_ids) }, userId)) return null
  return {
    ok: false,
    code: userId ? 'not_participant' : 'login_required',
    lifecycle: 'active',
    message: 'Only invited players can enter this room',
  }
}
