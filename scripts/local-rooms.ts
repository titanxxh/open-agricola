import { initializeDatabase, getDb } from '../server/db'
import { PostgresRoomPersistence } from '../server/game/persistence/postgres-adapter'
import { FIXED_DEV_ROOM_IDS } from '../server/game/room'

const [operation, variant] = process.argv.slice(2)
await initializeDatabase()
const db = getDb()
try {
  const persistence = new PostgresRoomPersistence(db)
  if (operation === 'reset') {
    const count = await db.transaction(async () => {
      await db.exec('SELECT pg_advisory_xact_lock(973)')
      if (await db.prepare("SELECT 1 FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint LIMIT 1").get()) throw new Error('Stop every application instance before resetting development rooms')
      const rooms = await db.prepare("SELECT id FROM rooms WHERE id ~ '^dev[2-6](-[a-f0-9-]{36})?$'").all<{ id: string }>()
      for (const { id } of rooms) {
        await db.prepare("UPDATE room_ownership SET status='retired',lease_until=0 WHERE room_id=?").run(id)
        await persistence.discard(id)
      }
      return rooms.length
    })()
    console.log(`  Retired ${count} PostgreSQL development room(s); next games get new identities.`)
  } else if (operation === 'current') {
    for (const root of FIXED_DEV_ROOM_IDS) {
      const current = await db.prepare('SELECT room_id FROM development_room_slots WHERE root_id=?').get<{ room_id: string }>(root)
      if (current) console.log(`${root}=${current.room_id}`)
    }
  } else if (operation === 'missing-variant') {
    const missing: string[] = []
    for (const root of FIXED_DEV_ROOM_IDS) {
      const current = await db.prepare('SELECT room_id FROM development_room_slots WHERE root_id=?').get<{ room_id: string }>(root)
      const id = current?.room_id ?? root
      const snapshot = await persistence.load(id)
      if (!snapshot) continue
      const state = snapshot.serialized?.state
      const enabled = variant === 'parents' ? state?.enableParentCards
        : variant === 'direct-parents' ? state?.enableParentCards && state.players.every(player => player.parentCards?.mother && player.parentCards?.father)
        : variant === 'seasons' ? state?.enableThroughTheSeasons
        : variant === 'moor' ? state?.enableFarmersOfTheMoor
        : variant === 'snake' ? state?.enableSnakeOpening : false
      if (!enabled) missing.push(id)
    }
    if (missing.length) console.log(missing.join(', '))
  } else throw new Error('Usage: local-rooms.ts reset | current | missing-variant <variant>')
} finally { await db.close() }
