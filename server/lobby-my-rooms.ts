import type { MyActiveRoom } from '../shared/contract/lobby'
import { playerColorOptions } from '../shared/contract/state-constants'
import type { PostgresDatabase } from './database/postgres'
import { parseRoomBody } from './game/persistence/room-body-codec'

type RoomRow = Omit<MyActiveRoom, 'players'> & { state_json: string | null; occupied_seats: number[] }

function lobbyPlayers(json: string | null, seats: number[]): MyActiveRoom['players'] {
  if (!json) return []
  let snapshot: unknown
  try { snapshot = parseRoomBody(json) } catch { return [] }
  if (!snapshot || typeof snapshot !== 'object' || !('state' in snapshot)) return []
  const state = snapshot.state
  if (!state || typeof state !== 'object' || !('players' in state) || !Array.isArray(state.players)) return []
  return state.players.flatMap((player: unknown, playerIndex) => {
    if (!seats.includes(playerIndex) || !player || typeof player !== 'object'
      || !('name' in player) || typeof player.name !== 'string' || !('color' in player)) return []
    const color = playerColorOptions.find(option => option === player.color)
    if (!color) return []
    return [{ playerIndex, name: player.name, color, nameIsDefault: 'nameIsDefault' in player && player.nameIsDefault === true }]
  })
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
    ...room, players: lobbyPlayers(state_json, occupied_seats),
  }))
}
