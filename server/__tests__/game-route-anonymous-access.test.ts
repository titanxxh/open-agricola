import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { getDb } from '../db'
vi.mock('../db', async () => {
  const { createTestDatabase } = await import('./_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})
afterAll(async () => { await getDb().close() })
afterEach(() => { vi.unstubAllEnvs() })

type MockRes = ServerResponse & { statusCode: number; body: string }

const mockReq = (method: string, url: string, token?: string): IncomingMessage => ({
  method,
  url,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  on() { return this },
} as unknown as IncomingMessage)

const mockRes = (): MockRes => {
  let statusCode = 200
  let body = ''
  return {
    get statusCode() { return statusCode },
    set statusCode(value) { statusCode = value },
    get body() { return body },
    writeHead(code: number) { statusCode = code },
    setHeader() {},
    end(data?: string) { body = data ?? '' },
  } as unknown as MockRes
}

const getState = async (token?: string) => {
  const { handleGameRoute } = await import('../game-router.ts')
  const res = mockRes()
  const handled = await handleGameRoute(mockReq('GET', '/api/game/state', token), res)
  return { handled, res }
}

describe('HTTP debug sandbox anonymous access (#993)', () => {
  it('rejects session-less calls when anonymous access is disabled', async () => {
    vi.stubEnv('ALLOW_ANONYMOUS_WS', 'false')
    const { handled, res } = await getState()
    expect(handled).toBe(true)
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'login_required' })
  })

  it('rejects session-less calls in production when the flag is unset', async () => {
    vi.stubEnv('ALLOW_ANONYMOUS_WS', undefined)
    vi.stubEnv('NODE_ENV', 'production')
    const { res } = await getState()
    expect(res.statusCode).toBe(401)
  })

  it('serves session-less calls when anonymous access is enabled', async () => {
    vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
    const { handled, res } = await getState()
    expect(handled).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveProperty('state.round')
  })

  it('serves authenticated calls when anonymous access is disabled', async () => {
    vi.stubEnv('ALLOW_ANONYMOUS_WS', 'false')
    const { createSession } = await import('../auth.ts')
    await getDb().prepare(`
      INSERT INTO users (id, username, display_name, password_hash, created_at)
      VALUES ('u993', 'sandbox_user_993', 'Sandbox User', 'x', ?)
    `).run(Date.now())
    const token = await createSession('u993')
    expect(token).toBeTruthy()
    const { res } = await getState(token!)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveProperty('state.round')
  })

  it('leaves non-sandbox paths to other handlers', async () => {
    vi.stubEnv('ALLOW_ANONYMOUS_WS', 'false')
    const { handleGameRoute } = await import('../game-router.ts')
    expect(await handleGameRoute(mockReq('GET', '/api/health'), mockRes())).toBe(false)
  })
})
