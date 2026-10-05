import { createTestDatabase } from '../../../__tests__/_helpers/postgres'
import type { PostgresDatabase } from '../../../database/postgres'
import { afterEach, describe, expect, it } from 'vitest'
import { PostgresRoomPersistence } from '../postgres-adapter.ts'
import { InMemoryRoomPersistence } from '../memory-adapter.ts'
import type { RoomMeta, RoomPersistence } from '../room-persistence.ts'
import type { PersistedSessionSnapshot } from '../../../../shared/session/serialization.ts'

const META: RoomMeta = {
  createdBy: 'u',
  maxPlayers: 2,
  customCardDbIds: ['x'],
  status: 'playing',
  players: [{ userId: 'u', playerIndex: 0 }],
}
const STATE = {
  state: { _stub: true, players: [] },
  frame: { _stub: true },
  sessionCursor: {},
} as unknown as PersistedSessionSnapshot

const databases: PostgresDatabase[] = []
afterEach(async () => { for (const db of databases.splice(0)) await db.close() })
const setupPostgres = async (): Promise<RoomPersistence> => {
  const db = await createTestDatabase()
  databases.push(db)
  await db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES ('u', 'u', '', 'User', 1)").run()
  return new PostgresRoomPersistence(db)
}
const adapters: Array<[string, () => RoomPersistence | Promise<RoomPersistence>]> = [
  ['postgres', setupPostgres],
  ['memory', () => new InMemoryRoomPersistence()],
]

for (const [name, factory] of adapters) {
  describe(`RoomPersistence contract — ${name}`, () => {
    it('load returns null for missing id', async () => {
      const p = await factory()
      expect((await p.load('nope'))).toBeNull()
    })

    it('save → load round-trips serialized', async () => {
      const p = await factory()
      ;(await p.save('r1', STATE, META))
      expect((await p.load('r1'))?.serialized).toEqual(STATE)
    })

    it('discard removes the row', async () => {
      const p = await factory()
      ;(await p.save('r1', STATE, META))
      ;(await p.discard('r1'))
      expect((await p.load('r1'))).toBeNull()
    })

    it('detects active room ids', async () => {
      const p = await factory()
      ;(await p.save('r1', STATE, META))
      expect((await p.hasRoomId('r1'))).toBe(true)
      expect((await p.hasRoomId('missing'))).toBe(false)
    })

    it('listRestorable returns at most non-finished rooms', async () => {
      const p = await factory()
      ;(await p.save('r-active', STATE, { ...META, status: 'playing' }))
      ;(await p.save('r-finished', STATE, { ...META, status: 'finished' }))
      const res = (await p.listRestorable({ now: Date.now(), waitingTtlMs: 60_000, playingTtlMs: 60_000 }))
      expect(res.every((s) => s.meta.status !== 'finished')).toBe(true)
    })

    it('save with null serialized on existing row preserves state', async () => {
      const p = await factory()
      ;(await p.save('r1', STATE, META))
      ;(await p.save('r1', null, { ...META, status: 'playing' }))
      const snap = (await p.load('r1'))
      expect(snap?.serialized).toEqual(STATE)
    })
  })
}
