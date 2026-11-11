import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import * as database from '../db'
import { createSession } from '../auth'
import { handleGameRoute, shutdownSandboxSessions } from '../game-router'
import { createWorkSession } from './_helpers/session-fixtures'
import { serializeState } from '../../shared/session/serialization'

let db: Awaited<ReturnType<typeof createTestDatabase>>
beforeEach(async () => {
  db = await createTestDatabase()
  vi.spyOn(database, 'getDb').mockReturnValue(db)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
  vi.stubEnv('ADMIN_USERS', 'http-owner')
  for (const name of ['http-owner', 'http-player']) await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1)").run(name, name, name)
})
afterEach(async () => { shutdownSandboxSessions(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await db?.close() })
async function request(url: string, body: unknown, token?: string, capability?: string, method = 'POST') {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { method, url, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(capability ? { 'x-open-agricola-client-capabilities': capability } : {}) } })
  const response = { status: 0, data: '', writeHead(status: number) { this.status = status }, setHeader() {}, end(data: string) { this.data = data } }
  await handleGameRoute(req as IncomingMessage, response as unknown as ServerResponse)
  return { status: response.status, body: JSON.parse(response.data) }
}
const removedConfigurations = [
  { teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' } },
  { teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' } },
  { cooperationRules: true },
  { multihand: true },
]

it('rejects removed configurations for every account before replacing an ordinary HTTP session', async () => {
  const owner = (await createSession('http-owner'))!, player = (await createSession('http-player'))!
  await db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run('http-player', 'http-owner', 123)
  for (const token of [owner, player, undefined]) {
    const created = await request('/api/game/new', { seed: 1661, playerCount: 2 }, token)
    expect(created.status).toBe(200)
    const before = await request('/api/game/state', {}, token, undefined, 'GET')
    for (const url of ['/api/game/new', '/api/game/new-sandbox']) {
      for (const configuration of removedConfigurations) {
        const rejected = await request(url, { playerCount: 4, ...configuration }, token, 'team-cooperation-v1')
        expect(rejected).toEqual({ status: 400, body: { ok: false, error: 'Unsupported game configuration' } })
        expect(await request('/api/game/state', {}, token, undefined, 'GET')).toEqual(before)
      }
    }
    for (const state of [{ ...created.body.state, team: { configuration: removedConfigurations[0].teamConfig } },
      { state: { ...created.body.state, team: { configuration: removedConfigurations[1].teamConfig } } }]) {
      expect(await request('/api/game/load', { state }, token)).toEqual({ status: 400, body: { ok: false, error: 'Unsupported game configuration' } })
      expect(await request('/api/game/state', {}, token, undefined, 'GET')).toEqual(before)
    }
  }
})

it('accepts omitted, empty and unknown capability headers for ordinary HTTP actions', async () => {
  const token = (await createSession('http-owner'))!
  const fixture = createWorkSession({ seed: 1661, configure(state) { state.players[0]!.resources.food = 0 } })
  let state: ReturnType<typeof serializeState>
  try { state = fixture.withCtx(() => serializeState(fixture.state, { actionHooks: fixture.actionHooks })) } finally { fixture.dispose() }
  for (const capability of [undefined, '', 'unknown, team-cooperation-v1']) {
    expect((await request('/api/game/load', { state }, token, capability)).status).toBe(200)
    const action = await request('/api/game/action', { playerIndex: 0, spaceId: 'day-laborer' }, token, capability)
    expect(action.status).toBe(200)
    expect(action.body.state.players[0].resources.food).toBe(2)
    expect(action.body.state.actionSpaces.find((space: { id: string }) => space.id === 'day-laborer').takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
  }
})

it('answers unauthenticated capability preflight without creating a sandbox', async () => {
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'false')
  const req = Object.assign(Readable.from([]), { method: 'OPTIONS', url: '/api/game/state', headers: {} })
  const response = { status: 0, headers: {}, writeHead(status: number, headers: Record<string, string>) { this.status = status; this.headers = headers }, end() {} }
  expect(await handleGameRoute(req as IncomingMessage, response as unknown as ServerResponse)).toBe(true)
  expect(response.status).toBe(204)
  expect(response.headers).toMatchObject({ 'Access-Control-Allow-Headers': expect.stringContaining('X-Open-Agricola-Client-Capabilities') })
})
