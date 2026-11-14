import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { request } from 'node:http'
import WebSocket from 'ws'
import { expect, it, vi } from 'vitest'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION, BROWSER_WS_PROTOCOL } from '../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_HEADER, PRERELEASE_BUILD_PROTOCOL_PREFIX, PRERELEASE_GENERATION_HEADER, PRERELEASE_GENERATION_PROTOCOL_PREFIX } from '../../shared/contract/prerelease-runtime'
import type { PrereleaseIdentityState } from '../../shared/contract/prerelease-identity'
import type { ServerEvent } from '../../shared/contract/protocol/ws'
import { RoomDirectory } from '../game/room-directory'
import { createPublicIngress } from '../ingress'
import { PrereleaseSessions } from '../prerelease-sessions'
import { createTestDatabase } from './_helpers/postgres'
import { startFormalSoloBackend } from './_helpers/formal-solo-network'

function post(url: string, headers: Record<string, string>, body?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method: 'POST', headers, signal: AbortSignal.timeout(2_000) }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => { chunks.push(Buffer.from(chunk)) })
      response.on('error', reject)
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })))
    })
    outgoing.on('error', reject); outgoing.end(body)
  })
}

it('dissolves at the authenticated room owner despite a different prerelease affinity', async () => {
  const db = await createTestDatabase(), directory = new RoomDirectory(db)
  const runtime = { buildId: 'a'.repeat(40), generationId: randomUUID(), appOrigin: 'https://pre.example.test',
    formalAppOrigin: 'https://formal.example.test', formalApiBase: 'https://formal-api.example.test', targetId: 'prerelease-main' }
  let subject = { id: randomUUID(), username: 'dissolve_creator', displayName: 'Creator' }
  const service = new PrereleaseSessions({ db, runtime, authority: {
    exchange: async () => {
      const now = Date.now()
      return { protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId: runtime.generationId,
        grantId: randomUUID().replaceAll('-', '').padEnd(43, 'g'), account: { kind: 'active', subject },
        source: { kind: 'active', expiresAt: now + 86_400_000 }, grant: { kind: 'active', expiresAt: now + 86_400_000 },
        betaAccess: true, confirmedAt: now, validUntil: now + 30_000 } satisfies PrereleaseIdentityState
    }, status: async () => { throw new Error('Unexpected identity refresh') }, events: async () => [], acknowledge: async () => {},
  } })
  const apps: Awaited<ReturnType<typeof startFormalSoloBackend>>[] = []
  let ingress: ReturnType<typeof createPublicIngress> | undefined
  let socket: WebSocket | undefined
  try {
    for (let index = 0; index < 2; index++) apps.push(await startFormalSoloBackend(db, {
      RELEASE_CHANNEL: 'prerelease', GAME_BUILD_ID: runtime.buildId, PUBLIC_APP_ORIGIN: runtime.appOrigin,
      PUBLIC_API_BASE: runtime.appOrigin, FORMAL_APP_ORIGIN: runtime.formalAppOrigin, FORMAL_API_BASE: runtime.formalApiBase,
      PRERELEASE_DATA_GENERATION: runtime.generationId, PRERELEASE_TARGET_ID: runtime.targetId,
      PRERELEASE_IDENTITY_SERVICE_KEY: 'dissolve-fixture-identity-key-'.repeat(2),
    }))
    const creator = { ...subject }
    async function login() {
      const pending = await service.beginHandoff(), params = new URLSearchParams(new URL(pending.formalUrl).hash.slice(1))
      return (await service.exchangeHandoff(pending.cookie, { protocolVersion: 1, code: 'c'.repeat(43),
        state: params.get('state')!, browserChallenge: params.get('browserChallenge')!, returnTo: `${runtime.formalAppOrigin}/` })).token
    }
    const token = await login()
    const headers = { Host: new URL(runtime.appOrigin).host, Origin: runtime.appOrigin, [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION),
      [PRERELEASE_BUILD_HEADER]: runtime.buildId, [PRERELEASE_GENERATION_HEADER]: runtime.generationId }
    const cookie = `__Host-oa-pre-session=${token}`
    const allocationId = randomUUID()
    const located = await post(apps[0]!.baseUrl + '/api/rooms/locate', { ...headers, Cookie: cookie, 'Content-Type': 'application/json' }, JSON.stringify({ allocationId }))
    expect({ status: located.status, body: located.ok ? undefined : await located.json() }).toEqual({ status: 200, body: undefined })
    const route: { wsPath: string } = await located.json()
    const owner = /^\/nodes\/([^/]+)\/ws$/.exec(route.wsPath)![1]!
    const instances = await directory.instances()
    const ownerApp = instances.find(instance => instance.instance_id === owner)!
    const other = instances.find(instance => instance.instance_id !== owner)!
    socket = new WebSocket(ownerApp.internal_url.replace('http:', 'ws:') + '/ws', [BROWSER_WS_PROTOCOL,
      PRERELEASE_BUILD_PROTOCOL_PREFIX + runtime.buildId, PRERELEASE_GENERATION_PROTOCOL_PREFIX + runtime.generationId],
    { headers: { Host: new URL(runtime.appOrigin).host, Origin: runtime.appOrigin, Cookie: cookie } })
    const events: ServerEvent[] = []
    socket.on('message', raw => { const event: ServerEvent = JSON.parse(raw.toString()); events.push(event) })
    await once(socket, 'open')
    socket.send(JSON.stringify({ type: 'getCommandScope', requestId: 'scope' }))
    await vi.waitFor(() => expect(events.some(event => event.type === 'commandScope')).toBe(true))
    const scope = events.find((event): event is Extract<ServerEvent, { type: 'commandScope' }> => event.type === 'commandScope')!
    socket.send(JSON.stringify({ type: 'createRoom', requestId: 'create', maxPlayers: 2, enableCommunityDeck: false, customCardIds: [],
      commandContext: { scopeId: scope.scope.scopeId, commandId: randomUUID(), allocationId } }))
    await vi.waitFor(() => expect(events.some(event => event.type === 'roomCreated')).toBe(true))
    const created = events.find((event): event is Extract<ServerEvent, { type: 'roomCreated' }> => event.type === 'roomCreated')!
    const roomId = created.roomId
    expect((await directory.currentRoute(roomId))?.owner.instanceId).toBe(owner)
    const before = await db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)
    expect(before).toMatchObject({ status: 'waiting', created_by: creator.id, version: 0 })

    vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
    vi.stubEnv('NODE_ENV', 'test')
    ingress = createPublicIngress(directory, false)
    ingress.server.listen(0, '127.0.0.1'); await once(ingress.server, 'listening')
    const address = ingress.server.address()
    if (!address || typeof address === 'string') throw new Error('Ingress fixture did not listen')
    const url = `http://127.0.0.1:${address.port}/api/rooms/${roomId}/dissolve`
    const dissolve = (requestHeaders: Record<string, string>) => post(url, requestHeaders)
    const affinity = `agricola_instance=${other.instance_id}`
    // A table lock makes any room-ownership lookup wait. Admission must finish first.
    await db.transaction(async () => {
      await db.exec('LOCK TABLE room_ownership IN ACCESS EXCLUSIVE MODE')
      for (const [requestHeaders, status, code] of [
        [{ ...headers, Cookie: affinity }, 401, 'prerelease_auth_required'],
        [{ ...headers, Cookie: `${affinity}; __Host-oa-pre-session=unknown` }, 503, 'prerelease_access_paused'],
        [{ ...headers, Cookie: `${affinity}; ${cookie}`, [PRERELEASE_BUILD_HEADER]: 'b'.repeat(40) }, 426, 'prerelease_runtime_changed'],
        [{ ...headers, Cookie: `${affinity}; ${cookie}`, Origin: runtime.formalAppOrigin }, 401, 'prerelease_auth_required'],
      ] satisfies [Record<string, string>, number, string][]) {
        const rejected = await dissolve(requestHeaders)
        expect({ status: rejected.status, body: await rejected.json() }).toEqual({ status, body: { ok: false, code } })
      }
    })()
    expect(await db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)).toEqual(before)

    subject = { id: randomUUID(), username: 'dissolve_non_creator', displayName: 'Other Farmer' }
    const outsider = await login()
    const denied = await dissolve({ ...headers, Cookie: `${affinity}; __Host-oa-pre-session=${outsider}` })
    const deniedBody: unknown = await denied.json()
    expect(await db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)).toEqual(before)
    const response = await dissolve({ ...headers, Cookie: `${affinity}; ${cookie}` })
    expect({ creator: { status: response.status, body: await response.json() }, outsider: { status: denied.status, body: deniedBody } }).toEqual({
      creator: { status: 200, body: { ok: true } }, outsider: { status: 400, body: { ok: false, error: 'only the room creator can dissolve' } },
    })
    expect(await db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId)).toBeUndefined()
    expect(await db.prepare('SELECT status,instance_id FROM room_ownership WHERE room_id=?').get(roomId)).toEqual({ status: 'retired', instance_id: owner })
    await vi.waitFor(() => expect(events).toContainEqual({ type: 'roomDissolved', roomId }))
  } finally {
    service.close()
    if (socket && socket.readyState !== WebSocket.CLOSED) { const closed = once(socket, 'close'); socket.close(); await closed }
    await ingress?.shutdown()
    for (const app of apps.reverse()) await app.close()
    await db.close()
    vi.unstubAllEnvs()
  }
}, 60_000)
