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
const teamConfig = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' }

it('rejects team creation through both HTTP entry points and allows an administrator', async () => {
  const player = await createSession('http-player'), owner = await createSession('http-owner')
  for (const url of ['/api/game/new', '/api/game/new-sandbox']) {
    for (const token of [player, undefined]) {
      const result = await request(url, { playerCount: 4, teamConfig }, token ?? undefined)
      expect(result).toEqual({ status: 403, body: { ok: false, code: 'experimental_feature_unavailable', feature: 'team-modes', error: 'Experimental feature unavailable' } })
    }
    expect((await request(url, { playerCount: 4, teamConfig }, owner!)).status).toBe(200)
  }
  expect((await request('/api/game/new', { playerCount: 2 }, player!)).status).toBe(200)
})

it('rejects loading a team state into the debug sandbox without availability', async () => {
  const player = await createSession('http-player'), owner = await createSession('http-owner')
  const created = await request('/api/game/new-sandbox', { playerCount: 4, teamConfig }, owner!)
  const teamState = created.body.state
  expect(teamState.team).toBeTruthy()
  const denied = { status: 403, body: { ok: false, code: 'experimental_feature_unavailable', feature: 'team-modes', error: 'Experimental feature unavailable' } }
  for (const state of [teamState, { state: teamState }]) {
    expect(await request('/api/game/load', { state }, player!)).toEqual(denied)
    expect(await request('/api/game/load', { state }, undefined)).toEqual(denied)
  }
  expect((await request('/api/game/load', { state: teamState }, owner!)).status).toBe(200)
  const ordinary = await request('/api/game/new', { playerCount: 2 }, player!)
  expect((await request('/api/game/load', { state: ordinary.body.state }, player!)).status).toBe(200)
})

it('separates cooperation beta qualification from current HTTP client capability at creation and loading', async () => {
  const owner = await createSession('http-owner')
  const cooperation = { ...teamConfig, cooperationRules: true }
  const denied = { status: 409, body: { ok: false, error: 'Please refresh this page to use official cooperation rules.', code: 'client_refresh_required' } }
  for (const url of ['/api/game/new', '/api/game/new-sandbox']) {
    expect(await request(url, { playerCount: 4, teamConfig: cooperation }, owner!)).toEqual(denied)
    expect((await request(url, { playerCount: 4, teamConfig: cooperation }, owner!, 'team-cooperation-v1')).status).toBe(200)
  }
  const ordinary = await request('/api/game/new-sandbox', { playerCount: 4, teamConfig }, owner!)
  const state = { ...ordinary.body.state, team: { ...ordinary.body.state.team, configuration: cooperation } }
  expect(await request('/api/game/load', { state }, owner!)).toEqual(denied)
  expect(await request('/api/game/load', { state: { state } }, owner!)).toEqual(denied)
  expect((await request('/api/game/load', { state }, owner!, 'team-cooperation-v1')).status).toBe(200)
})

it('rejects a malformed cooperation switch in a loaded team configuration', async () => {
  const owner = await createSession('http-owner')
  const created = await request('/api/game/new-sandbox', { playerCount: 4, teamConfig }, owner!)
  const state = { ...created.body.state, team: { ...created.body.state.team,
    configuration: { ...teamConfig, cooperationRules: 'true' } } }
  expect((await request('/api/game/load', { state }, owner!)).status).toBe(400)
})

it('blocks every unsupported request to a cooperative pending without changing it and permits an explicit new ordinary sandbox', async () => {
  const owner = (await createSession('http-owner'))!
  const capability = 'team-cooperation-v1'
  const fixture = createWorkSession({ seed: 1632, options: { playerCount: 4, teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } }, configure(state) {
    state.currentPlayerIndex = 0
    state.players[0]!.resources.wood = 6
  } })
  let state: ReturnType<typeof serializeState>
  try { state = fixture.withCtx(() => serializeState(fixture.state, { actionHooks: fixture.actionHooks })) } finally { fixture.dispose() }
  expect((await request('/api/game/load', { state }, owner, capability)).status).toBe(200)
  expect((await request('/api/game/action', { playerIndex: 0, spaceId: 'marketplace' }, owner, capability)).body.interaction.request.kind).toBe('marketplace-select')
  const before = await request('/api/game/state', {}, owner, capability, 'GET')
  const denied = { status: 409, body: { ok: false, code: 'client_refresh_required', error: 'Please refresh this page to use official cooperation rules.' } }
  for (const [url, body, method] of [
    ['/api/game/state', {}, 'GET'],
    ['/api/game/action', { playerIndex: 0, spaceId: 'forest' }, 'POST'],
    ['/api/game/choice', { playerIndex: 0, value: 'confirm' }, 'POST'],
    ['/api/game/commit-selection', { playerIndex: 0, payload: { stables: [{ row: 0, col: 2 }] } }, 'POST'],
    ['/api/game/undo', {}, 'POST'],
    ['/api/game/undo-action', {}, 'POST'],
    ['/api/game/round-end', {}, 'POST'],
    ['/api/game/fence-quote', { playerIndex: 0, requestKey: 'old-quote', payload: { edges: [], palisadeEdges: [] } }, 'POST'],
    ['/api/game/validate', { type: 'room', playerId: 'p1', payload: { rooms: [{ row: 1, col: 1 }] } }, 'POST'],
  ] as const) {
    expect(await request(url, body, owner, undefined, method), url).toEqual(denied)
    expect(await request('/api/game/state', {}, owner, capability, 'GET')).toEqual(before)
  }
  expect((await request('/api/game/new-sandbox', { seed: 1632, playerCount: 2 }, owner)).status).toBe(200)
  expect((await request('/api/game/state', {}, owner, undefined, 'GET')).body.state.team).toBeUndefined()
})

it('matches complete HTTP capability tokens and grants production beta creation without granting ordinary or anonymous accounts', async () => {
  const owner = (await createSession('http-owner'))!, player = (await createSession('http-player'))!
  const cooperation = { ...teamConfig, cooperationRules: true }
  for (const token of ['team-cooperation-v10', 'prefix-team-cooperation-v1', '["team-cooperation-v1"]', 'TEAM-COOPERATION-V1']) {
    expect((await request('/api/game/new', { playerCount: 4, teamConfig: cooperation }, owner, token)).status).toBe(409)
  }
  expect((await request('/api/game/new', { playerCount: 4, teamConfig: cooperation }, player, 'team-cooperation-v1')).status).toBe(403)
  expect((await request('/api/game/new', { playerCount: 4, teamConfig: cooperation }, undefined, 'team-cooperation-v1')).status).toBe(403)
  await db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run('http-player', 'http-owner', 123)
  expect((await request('/api/game/new', { playerCount: 4, teamConfig: cooperation }, player, 'unknown, team-cooperation-v1')).status).toBe(200)
})

it('answers unauthenticated capability preflight without creating a sandbox', async () => {
  vi.stubEnv('ALLOW_ANONYMOUS_WS', 'false')
  const req = Object.assign(Readable.from([]), { method: 'OPTIONS', url: '/api/game/state', headers: {} })
  const response = { status: 0, headers: {}, writeHead(status: number, headers: Record<string, string>) { this.status = status; this.headers = headers }, end() {} }
  expect(await handleGameRoute(req as IncomingMessage, response as unknown as ServerResponse)).toBe(true)
  expect(response.status).toBe(204)
  expect(response.headers).toMatchObject({ 'Access-Control-Allow-Headers': expect.stringContaining('X-Open-Agricola-Client-Capabilities') })
})
