import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'
import { getSessionByToken } from '../auth'
import { httpAdmission, requestSessionToken } from '../request-auth'
import { RoomDirectory } from '../game/room-directory'
import { createPublicIngress } from '../ingress'
import { createTestDatabase } from './_helpers/postgres'
import { releaseAll } from './_helpers/release-all'

const FORMAL_API_HOST = 'openagapi.titanxxh.com'
afterEach(() => vi.unstubAllEnvs())

async function fixture(count = 1, capacity = 1) {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('RELEASE_CHANNEL', 'stable')
  vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://open-agricola.titanxxh.com/')
  vi.stubEnv('PUBLIC_API_BASE', `https://${FORMAL_API_HOST}`)
  vi.stubEnv('CORS_ORIGIN', 'https://open-agricola.titanxxh.com')
  vi.stubEnv('FRONTEND_ROOT', '')
  const db = await createTestDatabase(), directory = new RoomDirectory(db)
  const applications: Server[] = [], calls: Array<{ node: string; authenticated: boolean }> = []
  let ingress: ReturnType<typeof createPublicIngress> | undefined
  const close = () => releaseAll([
    () => ingress?.shutdown(),
    ...applications.map(app => async () => { app.closeAllConnections(); await new Promise<void>(done => app.close(() => done())) }),
    () => db.close(),
  ])
  try {
    const token = randomUUID(), now = Date.now()
    await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('room-owner','room_owner','Room owner','unused-fixture-password-hash',?)").run(now)
    await db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at,auth_policy_version) VALUES(?,?,?,?,?)')
      .run(token, 'room-owner', now, now + 60_000, BROWSER_AUTH_VERSION)
    for (const id of ['one', 'two'].slice(0, count)) {
      const app = createServer((req, res) => {
        void (async () => {
          const admission = httpAdmission(req)
          if (!admission.ok) { calls.push({ node: id, authenticated: false }); res.writeHead(admission.status).end(); return }
          const session = await getSessionByToken(requestSessionToken(req), { db })
          calls.push({ node: id, authenticated: !!session })
          if (!session) { res.writeHead(401).end(); return }
          const match = /^\/api\/rooms\/([A-Za-z0-9-]+)\/dissolve$/.exec(req.url ?? '')
          if (!match) { res.writeHead(404).end(); return }
          const room = await db.prepare('SELECT created_by FROM rooms WHERE id=?').get<{ created_by: string }>(match[1])
          if (room?.created_by !== session.user.id) { res.writeHead(403).end(); return }
          const route = await directory.claim(match[1]!, id)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ node: id, roomId: route.roomId, userId: session.user.id }))
        })().catch(() => { if (!res.headersSent) res.writeHead(500).end(); else res.destroy() })
      })
      applications.push(app)
      app.listen(0, '127.0.0.1'); await once(app, 'listening')
      const address = app.address()
      if (!address || typeof address === 'string') throw new Error('Application did not listen')
      await directory.register(id, `http://127.0.0.1:${address.port}`, 'ingress-admission', capacity)
      await directory.activate(id)
    }
    ingress = createPublicIngress(directory, true)
    ingress.server.listen(0, '127.0.0.1'); await once(ingress.server, 'listening')
    const address = ingress.server.address()
    if (!address || typeof address === 'string') throw new Error('Ingress did not listen')
    const dissolve = (roomId: string, headers: IncomingHttpHeaders = {}) => new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: address.port, method: 'POST', path: `/api/rooms/${roomId}/dissolve`, headers: {
        host: FORMAL_API_HOST, ...headers,
      } }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk }); res.on('error', reject)
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      })
      req.on('error', reject); req.end()
    })
    const room = async (id: string) => { await db.prepare("INSERT INTO rooms(id,created_by,status,created_at,updated_at) VALUES(?,'room-owner','waiting',1,1)").run(id) }
    return { db, directory, token, calls, dissolve, room, close }
  } catch (error) {
    await close().catch((cleanupError: unknown) => { throw new AggregateError([error, cleanupError], 'Ingress fixture setup and cleanup failed', { cause: cleanupError }) })
    throw error
  }
}

it.each([
  { name: 'same-site sibling form', headers: { origin: 'https://pre.titanxxh.com', 'content-type': 'application/x-www-form-urlencoded' }, status: 403 },
  { name: 'unrecognized native bearer', headers: { authorization: 'Bearer never-issued' }, status: 401 },
])('does not reserve retained room capacity before rejecting a $name', async ({ headers, status }) => {
  const running = await fixture()
  try {
    await running.room('retained-room')
    expect(await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').all('retained-room')).toEqual([])
    expect((await running.dissolve('retained-room', headers)).status).toBe(status)
    expect(await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').all('retained-room')).toEqual([])
    expect(await running.db.prepare('SELECT id,status,version FROM rooms WHERE id=?').get('retained-room')).toEqual({ id: 'retained-room', status: 'waiting', version: 0 })
    expect(await running.directory.allocate('legitimate-actor', randomUUID())).toMatchObject({ owner: { instanceId: 'one' } })
    expect(running.calls).toEqual([{ node: 'one', authenticated: false }])
  } finally { await running.close() }
})

it('does not renew offline owner admission before rejecting a same-site sibling request', async () => {
  const running = await fixture()
  try {
    await running.room('offline-room')
    const route = await running.directory.claim('offline-room', 'one')
    await running.db.transaction(async () => {
      await running.directory.markActive('offline-room', route.owner)
      await running.db.prepare('UPDATE room_ownership SET admission_until=0 WHERE room_id=?').run('offline-room')
    })()
    const before = await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get('offline-room')
    expect((await running.dissolve('offline-room', { origin: 'https://pre.titanxxh.com', 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(403)
    expect(await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get('offline-room')).toEqual(before)
    expect(await running.db.prepare('SELECT id,status,version FROM rooms WHERE id=?').get('offline-room')).toEqual({ id: 'offline-room', status: 'waiting', version: 0 })
  } finally { await running.close() }
})

it('routes authenticated dissolution to the existing owner across two live instances', async () => {
  const running = await fixture(2, 2)
  try {
    await running.room('live-room')
    const route = await running.directory.claim('live-room', 'two')
    await running.db.transaction(async () => {
      await running.directory.markActive('live-room', route.owner)
      await running.directory.presence('live-room', route.owner, 1, 1)
    })()
    const before = await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get('live-room')
    const response = await running.dissolve('live-room', { authorization: `Bearer ${running.token}` })
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ node: 'two', roomId: 'live-room', userId: 'room-owner' })
    expect(running.calls).toEqual([{ node: 'two', authenticated: true }])
    expect(await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').get('live-room')).toEqual(before)

    await running.room('unloaded-room')
    expect(await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').all('unloaded-room')).toEqual([])
    const loaded = await running.dissolve('unloaded-room', { authorization: `Bearer ${running.token}` })
    expect(loaded.status).toBe(200)
    expect(await running.db.prepare('SELECT room_id,status FROM room_ownership WHERE room_id=?').get('unloaded-room'))
      .toEqual({ room_id: 'unloaded-room', status: 'reserved' })
    expect(running.calls.at(-1)?.authenticated).toBe(true)
  } finally { await running.close() }
})
