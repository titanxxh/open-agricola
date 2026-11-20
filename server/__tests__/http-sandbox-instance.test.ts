import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterAll, describe, expect, it, vi } from 'vitest'

type MockRes = ServerResponse & { statusCode: number; body: string }

import { getDb } from '../db'
import { classicFixtureCards } from '../../shared/cards/__tests__/__fixtures__/classic-definitions'
import { withClassicCardDefinitions } from '../../shared/cards/classic-catalog'
vi.mock('../db', async () => {
  const { createTestDatabase } = await import('./_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})
afterAll(async () => { await getDb().close() })

const mockReq = (
  method: string,
  url: string,
  body: unknown,
  token: string,
): IncomingMessage => {
  const bodyText = JSON.stringify(body)
  const request = {
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    on(event: string, callback: (chunk?: Buffer) => void) {
      if (event === 'data') callback(Buffer.from(bodyText))
      if (event === 'end') callback()
      return request
    },
  }
  return request as unknown as IncomingMessage
}

const mockRes = (): MockRes => {
  let statusCode = 200
  let body = ''
  return {
    get statusCode() { return statusCode },
    set statusCode(value) { statusCode = value },
    get body() { return body },
    writeHead(code: number) { statusCode = code },
    end(data?: string) { body = data ?? '' },
  } as unknown as MockRes
}

describe('HTTP sandbox', () => {
  it('rejects Workshop cards, which are playtested only in the browser sandbox', async () => {
    const { handleGameRoute } = await import('../game-router.ts')
    for (const body of [
      { seed: 42, customCardIds: ['workshop-card'] },
      { seed: 42, customCardVersions: [{ cardId: 'workshop-card', versionId: 'version-1' }] },
    ]) {
      const response = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/new-sandbox', body, 'sandbox-token'), response)
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.body)).toEqual({ ok: false, error: 'Workshop cards are playtested only in the browser sandbox' })
    }
  })

  it('gives every start, load and reset its own game instance', async () => {
    const db = getDb()
    const now = Date.now()
    ;(await db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES ('author', 'sandbox_author', 'Sandbox Author', 'x', ?)
    `).run(now))
    ;(await db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at, created_at, auth_policy_version) VALUES ('sandbox-token', 'author', ?, ?, 2)
    `).run(now + 3_600_000, now))
    const { handleGameRoute } = await import('../game-router.ts')
    const startRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/new-sandbox', { seed: 42, customCardIds: [] }, 'sandbox-token'), startRes)
    expect(startRes.statusCode).toBe(200)
    const started = JSON.parse(startRes.body)
    expect(started).toMatchObject({ ok: true })
    expect(started.gameInstanceId).toEqual(expect.any(String))
    const readRes = mockRes()
    await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), readRes)
    expect(JSON.parse(readRes.body).gameInstanceId).toBe(started.gameInstanceId)

    const invalidLoadRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/load', {}, 'sandbox-token'), invalidLoadRes)
    expect(invalidLoadRes.statusCode).toBe(400)
    const afterInvalidLoad = mockRes()
    await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), afterInvalidLoad)
    expect(JSON.parse(afterInvalidLoad.body).gameInstanceId).toBe(started.gameInstanceId)

    const loadRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/load', { state: started.state }, 'sandbox-token'), loadRes)
    const loaded = JSON.parse(loadRes.body)
    expect(loaded.ok).toBe(true)
    expect(loaded.gameInstanceId).toEqual(expect.any(String))
    expect(loaded.gameInstanceId).not.toBe(started.gameInstanceId)
    expect(loaded.state.gameSeed).toBe(started.state.gameSeed)

    const restartRes = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/new-sandbox', { seed: 42 }, 'sandbox-token'), restartRes)
    expect(restartRes.statusCode).toBe(200)
    const restarted = JSON.parse(restartRes.body)
    expect(restarted.gameInstanceId).not.toBe(started.gameInstanceId)
    expect(restarted.gameInstanceId).not.toBe(loaded.gameInstanceId)
    expect(restarted.state.gameSeed).toBe(started.state.gameSeed)
    const restartedReadRes = mockRes()
    await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), restartedReadRes)
    expect(JSON.parse(restartedReadRes.body).gameInstanceId).toBe(restarted.gameInstanceId)

    const classicCards = [...classicFixtureCards('CE', 'occupation', 21), ...classicFixtureCards('CI', 'minor', 21)]
    await withClassicCardDefinitions(classicCards, async () => {
      const classicStart = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/new-sandbox', {
        cardEdition: 'classic', classicDeckIds: ['CI', 'CE'], playerCount: 3, seed: 42, enableSnakeOpening: true,
      }, 'sandbox-token'), classicStart, true)
      const initial = JSON.parse(classicStart.body)
      expect(initial).toMatchObject({ ok: true })
      const reset = (instanceId: string, enabled: boolean) => {
        const response = mockRes()
        return handleGameRoute(mockReq('POST', '/api/game/reset-sandbox', {
          gameInstanceId: instanceId, seed: 93,
        }, 'sandbox-token'), response, enabled).then(handled => {
          expect(handled).toBe(true)
          return { status: response.statusCode, body: JSON.parse(response.body) }
        })
      }

      expect(await reset(initial.gameInstanceId, false)).toMatchObject({
        status: 400, body: { ok: false, code: 'classic_edition_disabled' },
      })
      const retained = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), retained, false)
      expect(JSON.parse(retained.body)).toMatchObject({ gameInstanceId: initial.gameInstanceId, state: { cardEdition: 'classic', gameSeed: 42 } })

      const resetGame = await reset(initial.gameInstanceId, true)
      expect(resetGame).toMatchObject({
        status: 200,
        body: {
          ok: true,
          state: { gameSeed: 93, cardEdition: 'classic', classicDeckIds: ['CI', 'CE'], enableSnakeOpening: true },
        },
      })
      expect(resetGame.body.state.players).toHaveLength(3)
      expect(resetGame.body.gameInstanceId).not.toBe(initial.gameInstanceId)
      expect(await reset(initial.gameInstanceId, true)).toMatchObject({
        status: 409, body: { ok: false, code: 'sandbox_replaced' },
      })
      const current = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), current, true)
      expect(JSON.parse(current.body).gameInstanceId).toBe(resetGame.body.gameInstanceId)
    })
  })
})
