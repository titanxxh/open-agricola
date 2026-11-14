import { parseTeamRoomMembers } from '../shared/contract/team-room'
import { parseTeamConfiguration } from '../shared/contract/team'
import { projectTeamWaitingRoom } from './game/team-room'
import type { LobbyExpansion, LobbyGameProgress, MyActiveRoom } from '../shared/contract/lobby'
import { playerColorOptions } from '../shared/contract/state-constants'
import { waitingSeatIndexes } from '../shared/session/waiting-seats'
import type { PostgresDatabase } from './database/postgres'
import { parseRoomBody } from './game/persistence/room-body-codec'

type RoomDetails = Pick<MyActiveRoom, 'players' | 'progress' | 'expansions' | 'waiting_player_indexes'>
type RoomRow = Omit<MyActiveRoom, keyof RoomDetails | 'hotseat'> & {
  team_members_json: unknown
  created_by: string | null
  state_json: string | null
  occupied_seats: number[]
  hotseat: number | string | boolean | null
}

const expansionFlags: LobbyExpansion[] = ['enableParentCards', 'enableThroughTheSeasons', 'enableFarmersOfTheMoor', 'enableCommunityDeck']
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function readLobbyState(json: string | null): Record<string, unknown> | null {
  if (!json) return null
  try {
    const snapshot: unknown = parseRoomBody(json)
    return isRecord(snapshot) && isRecord(snapshot.state) ? snapshot.state : null
  } catch { return null }
}

function lobbyDetails(state: Record<string, unknown> | null, seats: number[], status: RoomRow['status'], actor: number | null): RoomDetails {
  if (!state) return { players: [], progress: null, expansions: [], waiting_player_indexes: [] }
  const players = Array.isArray(state.players) ? state.players : []
  const participants: MyActiveRoom['players'] = players.flatMap((player: unknown, playerIndex) => {
    if (!seats.includes(playerIndex) || !isRecord(player) || typeof player.name !== 'string') return []
    const color = playerColorOptions.find(option => option === player.color)
    if (!color) return []
    return [{ playerIndex, name: player.name, color, nameIsDefault: 'nameIsDefault' in player && player.nameIsDefault === true }]
  })
  let progress: LobbyGameProgress | null = null
  if (status === 'playing') {
    const phase = state.phase
    if (phase === 'draft' || phase === 'parent-selection' || phase === 'solo-hand-selection') progress = { phase }
    else if (phase === 'playing' && typeof state.round === 'number' && Number.isInteger(state.round) && state.round > 0) {
      progress = { phase, round: state.round }
    }
  }
  return {
    players: participants,
    progress,
    expansions: expansionFlags.filter(flag => state[flag] === true),
    waiting_player_indexes: waitingSeatIndexes(status, state, seats, actor),
  }
}

/** Read committed room summaries without restoring sessions or exposing private state. */
export async function listMyActiveRooms(db: PostgresDatabase, userId: string): Promise<MyActiveRoom[]> {
  const rows = await db.prepare(`
    WITH my_rooms AS (
      SELECT r.id, r.status, r.max_players, r.hotseat, r.created_at, r.started_at, r.updated_at, r.team_members_json, r.created_by,
             r.state_json, rp.player_index,
             ARRAY(SELECT owner.player_index::integer FROM room_players owner
               WHERE owner.room_id=r.id AND owner.user_id=rp.user_id ORDER BY owner.player_index) AS owned_player_indexes,
             ARRAY(SELECT player_index::integer FROM room_players WHERE room_id = r.id ORDER BY player_index) AS occupied_seats,
             CASE WHEN r.status = 'playing' AND r.state_json IS JSON THEN
               CASE WHEN r.state_json::jsonb #>> '{state,phase}' = 'playing'
                      AND (r.state_json::jsonb #>> '{state,gameOver}') IS DISTINCT FROM 'true'
                    THEN COALESCE(
                      (r.state_json::jsonb #>> '{sessionCursor,engineStackCursor,frames,-1,ownerPlayerIndex}')::integer,
                      (r.state_json::jsonb #>> '{state,currentPlayerIndex}')::integer
                    ) END
             END AS current_player_index
      FROM rooms r
      LEFT JOIN LATERAL (SELECT owner.player_index, owner.user_id FROM room_players owner
        WHERE owner.room_id=r.id AND owner.user_id=?
          AND (r.hotseat=1 OR owner.player_index=(SELECT min(p.player_index) FROM room_players p
            WHERE p.room_id=r.id AND p.user_id=owner.user_id))) rp ON true
      WHERE r.status != 'finished' AND (rp.player_index IS NOT NULL OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(r.team_members_json) member WHERE member->>'userId'=?
      ))
    )
    SELECT *, CASE WHEN current_player_index = ANY(owned_player_indexes) THEN 1 ELSE 0 END AS my_turn
    FROM my_rooms
    ORDER BY my_turn DESC, updated_at DESC
    LIMIT 20
  `).all<RoomRow>(userId, userId)
  return rows.map(({ state_json, occupied_seats, hotseat, team_members_json, created_by, ...room }) => {
    const state = readLobbyState(state_json)
    const members = parseTeamRoomMembers(team_members_json)
    const self = members?.find(member => member.userId === userId)
    const teamConfig = state && isRecord(state.team) ? parseTeamConfiguration(state.team.configuration, room.max_players) : undefined
    const teamWaiting = self && room.status === 'waiting' && teamConfig
      ? projectTeamWaitingRoom({ id: room.id, maxPlayers: room.max_players, createdBy: created_by ?? undefined, teamMembers: members }, teamConfig, userId) : undefined
    return { ...room, ...(teamConfig ? { teamConfig } : {}), ...(teamWaiting ? { teamWaiting } : {}), hotseat: Number(hotseat) === 1,
      ...lobbyDetails(state, occupied_seats, room.status, room.current_player_index),
    }
  })
}
