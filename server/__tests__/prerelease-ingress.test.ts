import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory } from '../game/room-directory'
import { createPublicIngress } from '../ingress'

const buildId = 'a'.repeat(40)
afterEach(() => vi.unstubAllEnvs())

async function fixture(channel: 'stable' | 'prerelease') {
  const db = await createTestDatabase()
  const directory = new RoomDirectory(db)
  const root = await mkdtemp(join(tmpdir(), 'oa-pre-ingress-'))
  await writeFile(join(root, 'index.html'), '<main>Local stable frontend</main>')
  await writeFile(join(root, 'cards-manifest.json'), JSON.stringify({ privatePreCatalog: true }))
  await writeFile(join(root, 'frontend-build.json'), JSON.stringify({ format: 1, gameBuildId: buildId,
    basePath: '/open-agricola/', releaseChannel: channel, deploymentTarget: channel === 'prerelease' ? 'prerelease-hosted' : 'stable-hosted' }))
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('RELEASE_CHANNEL', channel)
  vi.stubEnv('FRONTEND_ROOT', root)
  vi.stubEnv('GAME_BUILD_ID', buildId)
  vi.stubEnv('PUBLIC_APP_ORIGIN', `https://${channel}.example.test/open-agricola/`)
  vi.stubEnv('PUBLIC_API_BASE', `https://${channel}.example.test`)
  const requests: string[] = []
  const app = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    if (req.url === '/open-agricola/auth/start') {
      res.writeHead(302, { Location: 'https://formal.example.test/?page=prerelease-handoff', 'Cache-Control': 'no-store' })
      res.end(); return
    }
    if (req.url === '/api/prerelease/runtime') { res.writeHead(200); res.end(JSON.stringify({ channel: 'prerelease', applicationOwned: true })); return }
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ ok: false, code: 'prerelease_auth_required' }))
  })
  app.listen(0, '127.0.0.1'); await once(app, 'listening')
  const appAddress = app.address()
  if (!appAddress || typeof appAddress === 'string') throw new Error('Application fixture did not listen')
  await directory.register('pre-only', `http://127.0.0.1:${appAddress.port}`, buildId)
  await directory.activate('pre-only')
  const ingress = createPublicIngress(directory, false)
  ingress.server.listen(0, '127.0.0.1'); await once(ingress.server, 'listening')
  const ingressAddress = ingress.server.address()
  if (!ingressAddress || typeof ingressAddress === 'string') throw new Error('Ingress fixture did not listen')
  return { db, requests, origin: `http://127.0.0.1:${ingressAddress.port}`,
    close: async () => { await ingress.shutdown(); await new Promise<void>(resolve => app.close(() => resolve())); await db.close(); await rm(root, { recursive: true }) } }
}

it('routes prerelease handoff, runtime and protected hosted data to the registered application before any static response', async () => {
  const running = await fixture('prerelease')
  try {
    const start = await fetch(running.origin + '/open-agricola/auth/start', { redirect: 'manual' })
    expect(start.status).toBe(302)
    expect(start.headers.get('location')).toBe('https://formal.example.test/?page=prerelease-handoff')
    const protectedCatalog = await fetch(running.origin + '/open-agricola/cards-manifest.json')
    expect(protectedCatalog.status).toBe(401)
    expect(await protectedCatalog.json()).toEqual({ ok: false, code: 'prerelease_auth_required' })
    expect(await (await fetch(running.origin + '/api/prerelease/runtime')).json()).toEqual({ channel: 'prerelease', applicationOwned: true })
    expect(running.requests).toEqual(['GET /open-agricola/auth/start', 'GET /open-agricola/cards-manifest.json', 'GET /api/prerelease/runtime'])
    expect((await fetch(running.origin + '/internal/metrics')).status).toBe(401)
    expect(running.requests).toHaveLength(3)
  } finally { await running.close() }
})

it('keeps stable frontend hosting local to ingress', async () => {
  const running = await fixture('stable')
  try {
    const page = await fetch(running.origin + '/open-agricola/')
    expect(page.status).toBe(200)
    expect(await page.text()).toBe('<main>Local stable frontend</main>')
    expect(running.requests).toEqual([])
  } finally { await running.close() }
})

it('does not acquire or change room ownership before the prerelease application rejects dissolution', async () => {
  const running = await fixture('prerelease')
  try {
    await running.db.prepare("INSERT INTO rooms(id,status,created_at,updated_at) VALUES('protected-room','waiting',1,1)").run()
    const before = await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').all('protected-room')
    const response = await fetch(running.origin + '/api/rooms/protected-room/dissolve', { method: 'POST' })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, code: 'prerelease_auth_required' })
    expect(running.requests).toEqual(['POST /api/rooms/protected-room/dissolve'])
    expect(await running.db.prepare('SELECT * FROM room_ownership WHERE room_id=?').all('protected-room')).toEqual(before)
    expect(await running.db.prepare('SELECT id,status,version FROM rooms WHERE id=?').get('protected-room')).toEqual({ id: 'protected-room', status: 'waiting', version: 0 })
  } finally { await running.close() }
})
