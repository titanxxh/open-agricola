import { afterAll, beforeAll, expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { createCollector } from '../observability/collector'
import { operationsMetrics } from '../observability/metrics'

const db = await createTestDatabase()
const now = Date.now()

const gauge = async (kind: string): Promise<number | undefined> => {
  const line = (await operationsMetrics.registry.metrics()).split('\n')
    .find(value => value.startsWith('agricola_platform{') && value.includes(`kind="${kind}"`))
  const value = line?.split(' ').at(-1)
  return value === undefined ? undefined : Number(value)
}

const collect = async () => createCollector(db, 'ingress')()

beforeAll(async () => {
  for (const [id, status, leaseUntil] of [
    ['live', 'ready', now + 600_000],
    ['second', 'ready', now + 600_000],
    ['stopped', 'stopped', now + 600_000],
    ['expired', 'ready', now - 1],
  ] as const) {
    await db.prepare(`INSERT INTO app_instances(instance_id, internal_url, generation, status, room_capacity, lease_until, updated_at)
      VALUES (?, ?, 'test', ?, 30, ?, ?)`).run(id, `http://${id}:9001`, status, leaseUntil, now)
    await db.prepare('INSERT INTO observability_instances(instance_id, observed_at) VALUES (?, ?)').run(id, now)
  }
  for (const id of ['alice', 'bob', 'unavailable-user', 'expired-presence']) {
    await db.prepare('INSERT INTO users(id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, id, id, 'unused-test-password', now)
  }
  for (const [instance, user, expiresAt] of [
    ['live', 'alice', now + 600_000],
    ['second', 'alice', now + 600_000],
    ['live', 'bob', now + 600_000],
    ['stopped', 'unavailable-user', now + 600_000],
    ['expired', 'unavailable-user', now + 600_000],
    ['live', 'expired-presence', now - 1],
  ] as const) {
    await db.prepare('INSERT INTO observability_presence(instance_id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(instance, user, expiresAt)
  }
})

afterAll(async () => { await db.close() })

it('exports only current online Rooms and seats while retaining disconnected saves as a separate count', async () => {
  const room = async (options: {
    id: string
    status?: 'waiting' | 'playing'
    instance?: string
    hotseat?: boolean
    development?: boolean
    ownerEpoch?: number
    presenceEpoch?: number
    connected?: number
    leaseUntil?: number
    ownerStatus?: 'active' | 'retired'
    lifecycle?: 'active' | 'expired'
  }) => {
    const { id, status = 'playing', instance = 'live', hotseat = false, development = false,
      ownerEpoch = 1, presenceEpoch = ownerEpoch, connected = 0, leaseUntil = now + 600_000,
      ownerStatus = 'active', lifecycle = 'active' } = options
    await db.prepare('INSERT INTO rooms(id, status, hotseat, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, status, hotseat ? 1 : 0, now, now)
    await db.prepare('INSERT INTO game_contexts(room_id, lifecycle, phase, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, lifecycle, status, now, now)
    await db.prepare(`INSERT INTO room_ownership(room_id, instance_id, epoch, lease_until, status, development)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, instance, ownerEpoch, leaseUntil, ownerStatus, development)
    await db.prepare('INSERT INTO room_presence(room_id, epoch, connected_count, occupied_count) VALUES (?, ?, ?, 2)')
      .run(id, presenceEpoch, connected)
  }
  await room({ id: 'waiting-online', status: 'waiting', connected: 2 })
  await room({ id: 'playing-online', connected: 1 })
  await room({ id: 'hotseat-online', hotseat: true, connected: 1 })
  await room({ id: 'development-online', development: true, connected: 2 })
  await room({ id: 'ordinary-retained' })
  await room({ id: 'hotseat-retained', hotseat: true })
  await room({ id: 'earlier-epoch', ownerEpoch: 2, presenceEpoch: 1, connected: 5 })
  await room({ id: 'expired-owner', leaseUntil: now - 1, connected: 8 })
  await room({ id: 'stopped-instance', instance: 'stopped', connected: 11 })
  await room({ id: 'expired-instance', instance: 'expired', connected: 13 })
  await room({ id: 'retired-owner', ownerStatus: 'retired', connected: 17 })
  await room({ id: 'expired-context', lifecycle: 'expired' })
  await room({ id: 'development-offline', development: true })
  await db.prepare("INSERT INTO rooms(id, status, created_at, updated_at) VALUES ('cold-save', 'playing', ?, ?)").run(now, now)
  await db.prepare("INSERT INTO game_contexts(room_id, lifecycle, phase, created_at, updated_at) VALUES ('cold-save', 'active', 'playing', ?, ?)").run(now, now)

  await collect()
  expect({
    users: await gauge('online_users'),
    waiting: await gauge('rooms_waiting'),
    playing: await gauge('rooms_playing'),
    hotseat: await gauge('rooms_hotseat'),
    development: await gauge('rooms_development'),
    retained: await gauge('rooms_retained'),
    seats: await gauge('players_connected'),
  }).toEqual({ users: 2, waiting: 1, playing: 1, hotseat: 1, development: 1, retained: 8, seats: 6 })

  await db.prepare('UPDATE room_presence SET connected_count=0').run()
  await collect()
  expect({
    waiting: await gauge('rooms_waiting'),
    playing: await gauge('rooms_playing'),
    hotseat: await gauge('rooms_hotseat'),
    development: await gauge('rooms_development'),
    retained: await gauge('rooms_retained'),
    seats: await gauge('players_connected'),
  }).toEqual({ waiting: 0, playing: 0, hotseat: 0, development: 0, retained: 11, seats: 0 })
})

it('removes the online-user value when a ready instance has no fresh user observation', async () => {
  await db.prepare("UPDATE observability_instances SET observed_at=? WHERE instance_id='second'").run(now - 120_000)
  await collect()
  expect(await gauge('online_users')).toBeUndefined()
  await db.prepare("UPDATE observability_instances SET observed_at=? WHERE instance_id='second'").run(Date.now())
  await collect()
  expect(await gauge('online_users')).toBe(2)
})
