import type { LobbyExpansion, LobbyGameProgress, MyActiveRoom } from '../shared/contract/lobby'
import { playerColorOptions } from '../shared/contract/state-constants'
import type { PostgresDatabase } from './database/postgres'
import { parseRoomBody } from './game/persistence/room-body-codec'

type RoomDetails = Pick<MyActiveRoom, 'players' | 'progress' | 'expansions' | 'waiting_player_indexes'>
type RoomRow = Omit<MyActiveRoom, keyof RoomDetails> & { state_json: string | null; occupied_seats: number[] }

const expansionFlags: LobbyExpansion[] = ['enableParentCards', 'enableThroughTheSeasons', 'enableFarmersOfTheMoor', 'enableCommunityDeck']
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function lobbyDetails(json: string | null, seats: number[], status: RoomRow['status'], actor: number | null): RoomDetails {
  const empty: RoomDetails = { players: [], progress: null, expansions: [], waiting_player_indexes: [] }
  if (!json) return empty
  let snapshot: unknown
  try { snapshot = parseRoomBody(json) } catch { return empty }
  if (!isRecord(snapshot) || !isRecord(snapshot.state)) return empty
  const state = snapshot.state
  const players = Array.isArray(state.players) ? state.players : []
  const draft = isRecord(state.draft) ? state.draft : null
  const pendingPicks = draft && isRecord(draft.pendingPicks) ? draft.pendingPicks : {}
  const waiting: number[] = []
  const participants: MyActiveRoom['players'] = players.flatMap((player: unknown, playerIndex) => {
    if (!seats.includes(playerIndex) || !isRecord(player) || typeof player.name !== 'string') return []
    const color = playerColorOptions.find(option => option === player.color)
    if (!color) return []
    if (status === 'playing' && state.phase === 'draft' && draft && typeof player.id === 'string') {
      const pick = pendingPicks[player.id]
      const submitted = isRecord(pick) && (draft.stage === 'occupation' ? typeof pick.occ === 'string'
        : draft.stage === 'farmersOfTheMoorMinor' || draft.stage === 'publishedMinor' ? typeof pick.minor === 'string'
          : typeof pick.occ === 'string' && typeof pick.minor === 'string')
      if (!submitted) waiting.push(playerIndex)
    } else if (playerIndex === actor) waiting.push(playerIndex)
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
  return { players: participants, progress, expansions: expansionFlags.filter(flag => state[flag] === true), waiting_player_indexes: waiting }
}

/** Read committed room summaries without restoring sessions or exposing private state. */
export async function listMyActiveRooms(db: PostgresDatabase, userId: string): Promise<MyActiveRoom[]> {
  const rows = await db.prepare(`
    WITH my_rooms AS (
      SELECT r.id, r.status, r.max_players, r.created_at, r.started_at, r.updated_at,
             r.state_json, rp.player_index,
             ARRAY(SELECT player_index::integer FROM room_players WHERE room_id = r.id ORDER BY player_index) AS occupied_seats,
             CASE WHEN r.status = 'playing' AND r.state_json IS JSON THEN
               CASE WHEN r.state_json::jsonb #>> '{state,phase}' = 'playing'
                      AND (r.state_json::jsonb #>> '{state,gameOver}') IS DISTINCT FROM 'true'
                    THEN COALESCE(
                      (r.state_json::jsonb #>> '{sessionCursor,engineStackCursor,frames,-1,ownerPlayerIndex}')::integer,
                      (r.state_json::jsonb #>> '{state,currentPlayerIndex}')::integer
                    ) END
             END AS current_player_index
      FROM room_players rp
      JOIN rooms r ON rp.room_id = r.id
      WHERE rp.user_id = ? AND r.status != 'finished'
    )
    SELECT *, CASE WHEN current_player_index = player_index THEN 1 ELSE 0 END AS my_turn
    FROM my_rooms
    ORDER BY my_turn DESC, updated_at DESC
    LIMIT 20
  `).all<RoomRow>(userId)
  return rows.map(({ state_json, occupied_seats, ...room }) => ({
    ...room, ...lobbyDetails(state_json, occupied_seats, room.status, room.current_player_index),
  }))
}
