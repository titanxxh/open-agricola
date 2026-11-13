import { randomUUID } from 'node:crypto'
import { afterAll, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { createWorkSession } from './_helpers/session-fixtures'
import { RoomDirectory } from '../game/room-directory'
import { CustomSessionExecutor, workerObservation } from '../game/custom-session-executor'
import { readSessionCapacity } from '../game/session-capacity'

vi.hoisted(() => {
  vi.stubEnv('APP_ROOM_CAPACITY', '1')
  vi.stubEnv('CUSTOM_SESSION_WORKER_CAPACITY', '1')
})
afterAll(() => vi.unstubAllEnvs())

it('keeps the existing defaults and permits explicitly disabling custom execution', () => {
  expect(readSessionCapacity({})).toEqual({ rooms: 30, customWorkers: 15 })
  expect(readSessionCapacity({ CUSTOM_SESSION_WORKER_CAPACITY: '0' })).toEqual({ rooms: 30, customWorkers: 0 })
})

it.each(['', '-1', '1.5', '1e1', ' 1', '31'])('rejects an invalid room capacity %j', value => {
  expect(() => readSessionCapacity({ APP_ROOM_CAPACITY: value })).toThrow('APP_ROOM_CAPACITY')
})

it.each(['', '-1', '1.5', '16'])('rejects an invalid worker capacity %j', value => {
  expect(() => readSessionCapacity({ CUSTOM_SESSION_WORKER_CAPACITY: value })).toThrow('CUSTOM_SESSION_WORKER_CAPACITY')
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

it('shares the configured worker limit across reservations and direct execution until disposal', async () => {
  const first = new CustomSessionExecutor(createWorkSession(), [])
  const next = new CustomSessionExecutor(createWorkSession(), [])
  try {
    expect(first.reserveWorkerSlot()).toBe(true)
    expect((await first.execute('getState', [])).ok).toBe(true)
    expect(workerObservation().workers_capacity).toBe(1)
    expect(next.reserveWorkerSlot()).toBe(false)
    const rejected = await next.execute('getState', [])
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toContain('capacity')
    first.dispose()
    expect(next.reserveWorkerSlot()).toBe(true)
    expect((await next.execute('getState', [])).ok).toBe(true)
  } finally {
    first.dispose()
    next.dispose()
  }
})
