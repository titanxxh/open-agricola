import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { getDb } from '../db'
import { createLocalUserForTests } from '../auth'
import { handlePrereleaseRoute, requirePrereleaseRequest } from '../prerelease-routes'
import { getPrereleaseSessions } from '../prerelease-sessions'
import { browserRequestHeaders } from './_helpers/browser-auth'
import { SoloNetworkPeer, startFormalSoloBackend } from './_helpers/formal-solo-network'
import { PRERELEASE_BUILD_HEADER, PRERELEASE_GENERATION_HEADER } from '../../shared/contract/prerelease-runtime'

vi.mock('../db', async () => {
  const { createTestDatabase } = await import('./_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})

let backend: Awaited<ReturnType<typeof startFormalSoloBackend>> | undefined
let gate: Server | undefined
afterEach(async () => {
  try {
    if (gate?.listening) await new Promise<void>((resolve, reject) => gate!.close(error => error ? reject(error) : resolve()))
    await backend?.close()
  } finally {
    gate = undefined; backend = undefined
    getPrereleaseSessions()?.close()
    vi.unstubAllEnvs()
  }
}, 30000)
afterAll(async () => { await getDb().close() })

async function storedRouting() {
  return {
    owners: await getDb().prepare('SELECT room_id,instance_id,epoch,status,admission_until FROM room_ownership ORDER BY room_id').all(),
    allocations: await getDb().prepare('SELECT actor_id,allocation_id,room_id,scope_id,command_id FROM room_allocations ORDER BY actor_id,allocation_id').all(),
    rooms: await getDb().prepare('SELECT id,status,version FROM rooms ORDER BY id').all(),
  }
}

it('requires login for production HTTP location even when anonymous WebSockets are enabled', async () => {
  backend = await startFormalSoloBackend(getDb(), { RELEASE_CHANNEL: 'stable', ALLOW_ANONYMOUS_WS: 'true' })
  const username = `location_${randomUUID().slice(0, 8)}`
  await createLocalUserForTests(username, 'location-password-1663')
  const login = await fetch(`${backend.baseUrl}/api/auth/login`, { method: 'POST',
    headers: { ...browserRequestHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'location-password-1663' }),
  })
  expect(login.status).toBe(200)
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const allocationId = randomUUID()
  const authenticated = await fetch(`${backend.baseUrl}/api/rooms/locate`, { method: 'POST',
    headers: { ...browserRequestHeaders, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ allocationId }),
  })
  expect(authenticated.status).toBe(200)
  const peer = await SoloNetworkPeer.connect(`${backend.baseUrl.replace('http:', 'ws:')}/ws`, cookie)
  try {
    const created = await peer.mutate({ type: 'createRoom', maxPlayers: 1, enableCommunityDeck: false, customCardIds: [] }, undefined, allocationId)
    const before = await storedRouting()
    expect(before.rooms).toContainEqual({ id: created.state.roomId, status: 'playing', version: 0 })
    const anonymous = await fetch(`${backend.baseUrl}/api/rooms/locate`, { method: 'POST',
      headers: { ...browserRequestHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ allocationId: randomUUID() }),
    })
    const body: unknown = await anonymous.json()
    expect({ status: anonymous.status, body, routing: await storedRouting() }).toEqual({
      status: 401, body: { error: 'Login required', code: 'login_required' }, routing: before,
    })
  } finally { await peer.close() }
}, 30000)

it('keeps the development default available for anonymous HTTP room location', async () => {
  backend = await startFormalSoloBackend(getDb(), { NODE_ENV: 'development', RELEASE_CHANNEL: 'stable', ALLOW_ANONYMOUS_WS: undefined })
  const allocationId = randomUUID()
  const response = await fetch(`${backend.baseUrl}/api/rooms/locate`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allocationId }),
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ allocationId, wsPath: expect.stringMatching(/^\/nodes\/[A-Za-z0-9-]+\/ws$/) })
  expect(await getDb().prepare('SELECT actor_id FROM room_allocations WHERE allocation_id=?').get(allocationId))
    .toEqual({ actor_id: 'development-anonymous' })
}, 30000)

it.each(['development', 'production'])('rejects anonymous prerelease HTTP location with the %s override', async nodeEnv => {
  let reads = 0
  gate = createServer((req, res) => { void (async () => {
    if (await handlePrereleaseRoute(req, res)) return
    if (!await requirePrereleaseRequest(req, res)) return
    reads++; res.writeHead(200); res.end('unexpected room discovery')
  })().catch(() => { res.writeHead(500); res.end() }) })
  await new Promise<void>(resolve => gate!.listen(0, '127.0.0.1', resolve))
  const address = gate.address()
  if (!address || typeof address === 'string') throw new Error('Prerelease location gate did not start')
  const appOrigin = `https://127.0.0.1:${address.port}`, generationId = randomUUID()
  for (const [key, value] of Object.entries({ NODE_ENV: nodeEnv, RELEASE_CHANNEL: 'prerelease', ALLOW_ANONYMOUS_WS: 'true',
    PUBLIC_APP_ORIGIN: appOrigin, PUBLIC_API_BASE: appOrigin, FORMAL_APP_ORIGIN: 'https://formal.example.test',
    FORMAL_API_BASE: 'https://formal.example.test', GAME_BUILD_ID: 'a'.repeat(40), PRERELEASE_DATA_GENERATION: generationId,
    PRERELEASE_TARGET_ID: 'prerelease-main', PRERELEASE_IDENTITY_SERVICE_KEY: 'location-fixture-key-'.repeat(3) })) vi.stubEnv(key, value)
  const before = await storedRouting()
  const response = await fetch(`http://127.0.0.1:${address.port}/api/rooms/locate`, { method: 'POST',
    headers: { ...browserRequestHeaders, Origin: appOrigin, 'Content-Type': 'application/json',
      [PRERELEASE_BUILD_HEADER]: 'a'.repeat(40), [PRERELEASE_GENERATION_HEADER]: generationId },
    body: JSON.stringify({ allocationId: randomUUID() }),
  })
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ ok: false, code: 'prerelease_auth_required' })
  expect(reads).toBe(0)
  expect(await storedRouting()).toEqual(before)
})
