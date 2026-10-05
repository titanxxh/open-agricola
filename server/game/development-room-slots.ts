import { randomUUID } from 'node:crypto'
import type { PostgresDatabase } from '../database/postgres'

/** Caller holds the placement lock (973). Slots never recycle Game Context IDs. */
export async function selectDevelopmentRoom(db: PostgresDatabase, rootId: string): Promise<string> {
  db.assertInTransaction()
  if (!/^dev[2-6]$/.test(rootId)) throw new Error('Invalid development room slot')
  const slot = await db.prepare(`SELECT s.room_id, c.lifecycle, o.status AS owner_status
    FROM development_room_slots s LEFT JOIN game_contexts c USING(room_id)
    LEFT JOIN room_ownership o USING(room_id) WHERE s.root_id=? FOR UPDATE OF s`)
    .get<{ room_id: string; lifecycle: string | null; owner_status: string | null }>(rootId)
  if (slot && (!slot.lifecycle || slot.lifecycle === 'active') && slot.owner_status !== 'retired') return slot.room_id
  const active = await db.prepare(`SELECT r.id FROM rooms r JOIN game_contexts c ON c.room_id=r.id
    WHERE (r.id=? OR r.id LIKE ?) AND c.lifecycle='active' ORDER BY r.created_at DESC,r.id LIMIT 1`)
    .get<{ id: string }>(rootId, `${rootId}-%`)
  const used = await db.prepare('SELECT 1 FROM game_contexts WHERE room_id=? UNION SELECT 1 FROM room_ownership WHERE room_id=?').get(rootId, rootId)
  const roomId = active?.id ?? (used ? `${rootId}-${randomUUID()}` : rootId)
  await db.prepare(`INSERT INTO development_room_slots(root_id,room_id) VALUES (?,?)
    ON CONFLICT(root_id) DO UPDATE SET room_id=excluded.room_id`).run(rootId, roomId)
  return roomId
}

/** A rematch moves its slot in the same transaction as Room retirement. */
export async function replaceDevelopmentRoom(db: PostgresDatabase, previousId: string, nextId: string): Promise<void> {
  db.assertInTransaction()
  await db.prepare('UPDATE development_room_slots SET room_id=? WHERE room_id=?').run(nextId, previousId)
}
