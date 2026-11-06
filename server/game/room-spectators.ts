import type { WebSocket } from 'ws'
import type { Room } from './room'
import type { PostgresDatabase } from '../database/postgres'

const subscriptions = new WeakMap<Room, Set<WebSocket>>()

export const roomSpectators = (room: Room): WebSocket[] => [...(subscriptions.get(room) ?? [])]
export function drainRoomSpectators(room: Room): WebSocket[] {
  const viewers = roomSpectators(room)
  subscriptions.delete(room)
  return viewers
}
export const isRoomSpectator = (room: Room | null, ws: WebSocket): boolean => !!room && subscriptions.get(room)?.has(ws) === true
export function addRoomSpectator(room: Room, ws: WebSocket): void {
  let viewers = subscriptions.get(room)
  if (!viewers) { viewers = new Set(); subscriptions.set(room, viewers) }
  viewers.add(ws)
}
export const removeRoomSpectator = (room: Room, ws: WebSocket): boolean => subscriptions.get(room)?.delete(ws) === true

/** Read the current route without acquiring ownership or an admission reservation. */
export async function spectatorRoute(db: Pick<PostgresDatabase, 'prepare'>, roomId: string): Promise<{ wsPath: string } | undefined> {
  const row = await db.prepare(`SELECT o.instance_id FROM rooms r
    JOIN game_contexts c ON c.room_id=r.id AND c.lifecycle='active'
    JOIN room_ownership o ON o.room_id=r.id AND o.status='active' AND NOT o.development
    JOIN app_instances i ON i.instance_id=o.instance_id AND i.status='ready'
    JOIN room_presence p ON p.room_id=r.id AND p.epoch=o.epoch AND p.connected_count>0
    WHERE r.id=? AND r.status='playing' AND r.hotseat=0 AND r.max_players>1
      AND r.invited_user_ids IS NULL
      AND o.lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint
      AND i.lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint`)
    .get<{ instance_id: string }>(roomId)
  return row ? { wsPath: `/nodes/${encodeURIComponent(row.instance_id)}/ws` } : undefined
}
