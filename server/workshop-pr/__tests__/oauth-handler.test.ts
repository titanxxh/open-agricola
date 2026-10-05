import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { handleOAuthCallback, handleOAuthStart } from '../oauth-handler.ts'
import { tokenCache } from '../token-cache.ts'
import { workshopPrConfig } from '../config.ts'
import { getDb } from '../../db'

vi.mock('../../db.ts', async () => {
  const { createTestDatabase } = await import('../../__tests__/_helpers/postgres')
  const db = await createTestDatabase()
  return { getDb: () => db }
})
afterAll(async () => { await getDb().close() })

function fakeReq(url: string): IncomingMessage {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.url = url
  req.method = 'GET'
  req.headers = { host: 'localhost:5175' }
  return req
}

function fakeRes() {
  let statusCode = 0
  let body = ''
  const headers: Record<string, string | number> = {}
  return {
    writeHead: (code: number, h?: Record<string, string | number>) => {
      statusCode = code
      Object.assign(headers, h ?? {})
    },
    end: (chunk?: string) => { body = chunk ?? '' },
    get statusCode() { return statusCode },
    get body() { return body },
    get headers() { return headers },
  } as unknown as ServerResponse & { body: string; statusCode: number; headers: Record<string, string | number> }
}

describe('handleOAuthCallback', () => {
  const origClientId = workshopPrConfig.clientId
  const origSecret = workshopPrConfig.clientSecret
  const origEnabled = workshopPrConfig.enabled

  beforeEach(async () => {
    vi.stubEnv('WORKSHOP_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 4).toString('base64'))
    await getDb().exec("TRUNCATE workshop_oauth_handshakes; INSERT INTO users (id, username, display_name, password_hash, created_at) SELECT id, id, id, 'hash', 1 FROM unnest(ARRAY['user-private-repo','user-42','user-42-cross-origin','user-43','user-44','user-45']) AS id ON CONFLICT DO NOTHING")
    // Stub config so the handler doesn't short-circuit on 503
    ;(workshopPrConfig as unknown as { clientId: string }).clientId = 'test_client_id'
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = 'test_secret'
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = true
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    ;(workshopPrConfig as unknown as { clientId: string }).clientId = origClientId
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = origSecret
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = origEnabled
  })

  it('requests repo scope so private upstream repositories can be updated', async () => {
    const hs = (await tokenCache.allocateHandshakeId('user-private-repo'))
    const req = fakeReq(`/api/workshop/github/oauth/start?hs=${hs}`)
    const res = fakeRes()
    ;(await handleOAuthStart(req, res, new URL(`http://x${req.url!}`)))

    expect(res.statusCode).toBe(302)
    const location = String(res.headers.Location)
    const authUrl = new URL(location)
    expect(authUrl.hostname).toBe('github.com')
    expect(authUrl.searchParams.get('scope')).toBe('repo')
    ;(await tokenCache.delete(hs))
  })

  it('exchanges code for token and binds to cache, returns popup-close HTML', async () => {
    const hs = (await tokenCache.allocateHandshakeId('user-42'))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('github.com/login/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'ghp_test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch: ${String(url)}`)
    }))

    const req = fakeReq(`/api/workshop/github/oauth/callback?code=abc&state=${hs}`)
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))

    expect((await tokenCache.get(hs))).toEqual({ token: 'ghp_test', userId: 'user-42' })
    expect((res as unknown as { body: string }).body).toContain('postMessage')
    ;(await tokenCache.delete(hs))
  })

  it('posts OAuth completion to cross-origin frontend opener', async () => {
    const hs = (await tokenCache.allocateHandshakeId('user-42-cross-origin'))
    vi.stubGlobal('fetch', vi.fn(async () => {
      return new Response(JSON.stringify({ access_token: 'ghp_test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const req = fakeReq(`/api/workshop/github/oauth/callback?code=abc&state=${hs}`)
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))

    const body = (res as unknown as { body: string }).body
    expect(body).toContain('postMessage({ type: \'workshop-pr-oauth\', result: result }, \'*\')')
    expect(body).not.toContain('window.location.origin')
    ;(await tokenCache.delete(hs))
  })

  it('rejects unknown state', async () => {
    const req = fakeReq('/api/workshop/github/oauth/callback?code=abc&state=not-real')
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
  })

  it('handles access_denied gracefully', async () => {
    const hs = (await tokenCache.allocateHandshakeId('user-43'))
    const req = fakeReq(`/api/workshop/github/oauth/callback?error=access_denied&state=${hs}`)
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))
    expect((res as unknown as { body: string }).body).toContain('access_denied')
    ;(await tokenCache.delete(hs))
  })

  it('returns popup HTML with error when token exchange fails (no access_token)', async () => {
    const hs = (await tokenCache.allocateHandshakeId('user-44'))
    vi.stubGlobal('fetch', vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'bad_verification_code' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    const req = fakeReq(`/api/workshop/github/oauth/callback?code=xyz&state=${hs}`)
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))
    expect((res as unknown as { body: string }).body).toContain('token_exchange_failed')
    expect((await tokenCache.get(hs))).toBeUndefined()
    ;(await tokenCache.delete(hs))
  })

  it('missing code with pending state returns 400', async () => {
    const hs = (await tokenCache.allocateHandshakeId('user-45'))
    const req = fakeReq(`/api/workshop/github/oauth/callback?state=${hs}`)
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
    ;(await tokenCache.delete(hs))
  })
})
