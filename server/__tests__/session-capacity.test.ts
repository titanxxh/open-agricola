import { randomUUID } from 'node:crypto'
import { afterAll, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory } from '../game/room-directory'
import { readSessionCapacity } from '../game/session-capacity'

vi.hoisted(() => {
  vi.stubEnv('APP_ROOM_CAPACITY', '1')
})
afterAll(() => vi.unstubAllEnvs())

it('keeps the existing room default and ignores the retired worker capacity', () => {
  expect(readSessionCapacity({})).toEqual({ rooms: 30 })
  expect(readSessionCapacity({ CUSTOM_SESSION_WORKER_CAPACITY: '0' })).toEqual({ rooms: 30 })
})

it.each(['', '-1', '1.5', '1e1', ' 1', '31'])('rejects an invalid room capacity %j', value => {
  expect(() => readSessionCapacity({ APP_ROOM_CAPACITY: value })).toThrow('APP_ROOM_CAPACITY')
})

it('applies the configured room limit to ordinary registration and releases retired admissions', async () => {
  const db = await createTestDatabase()
  try {
    const directory = new RoomDirectory(db)
    await directory.register('limited', 'http://127.0.0.1:9001', 'limited-build')
    await directory.activate('limited')
    const first = await directory.allocate('alice', randomUUID())
    await expect(directory.allocate('bob', randomUUID())).rejects.toThrow('capacity')
    await db.transaction(() => directory.retire(first.roomId, first.owner))()
    expect((await directory.allocate('bob', randomUUID())).owner.instanceId).toBe('limited')
  } finally {
    await db.close()
  }
})
