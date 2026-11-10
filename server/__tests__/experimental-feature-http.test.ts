import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import * as database from '../db'
import { createSession } from '../auth'
import { handleGameRoute, shutdownSandboxSessions } from '../game-router'

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
async function request(url: string, body: unknown, token?: string) {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', url, headers: token ? { authorization: `Bearer ${token}` } : {} })
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

it('denies cooperation independently at both creation entry points and debug loading', async () => {
  const owner = await createSession('http-owner')
  const cooperation = { ...teamConfig, cooperationRules: true }
  const denied = { status: 403, body: { ok: false, error: 'Experimental feature unavailable', code: 'experimental_feature_unavailable', feature: 'team-cooperation-rules' } }
  for (const url of ['/api/game/new', '/api/game/new-sandbox']) {
    expect(await request(url, { playerCount: 4, teamConfig: cooperation }, owner!)).toEqual(denied)
  }
  const ordinary = await request('/api/game/new-sandbox', { playerCount: 4, teamConfig }, owner!)
  const state = { ...ordinary.body.state, team: { ...ordinary.body.state.team, configuration: cooperation } }
  expect(await request('/api/game/load', { state }, owner!)).toEqual(denied)
  expect(await request('/api/game/load', { state: { state } }, owner!)).toEqual(denied)
})

it('rejects a malformed cooperation switch in a loaded team configuration', async () => {
  const owner = await createSession('http-owner')
  const created = await request('/api/game/new-sandbox', { playerCount: 4, teamConfig }, owner!)
  const state = { ...created.body.state, team: { ...created.body.state.team,
    configuration: { ...teamConfig, cooperationRules: 'true' } } }
  expect((await request('/api/game/load', { state }, owner!)).status).toBe(400)
})
