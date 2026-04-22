import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { handleOAuthCallback } from '../oauth-handler.ts'
import { tokenCache } from '../token-cache.ts'
import { workshopPrConfig } from '../config.ts'

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

  beforeEach(() => {
    // Stub config so the handler doesn't short-circuit on 503
    ;(workshopPrConfig as unknown as { clientId: string }).clientId = 'test_client_id'
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = 'test_secret'
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = true
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    ;(workshopPrConfig as unknown as { clientId: string }).clientId = origClientId
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = origSecret
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = origEnabled
  })

  it('exchanges code for token and binds to cache, returns popup-close HTML', async () => {
    const hs = tokenCache.allocateHandshakeId('user-42')
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

    expect(tokenCache.get(hs)).toEqual({ token: 'ghp_test', userId: 'user-42' })
    expect((res as unknown as { body: string }).body).toContain('postMessage')
    tokenCache.delete(hs)
  })

  it('rejects unknown state', async () => {
    const req = fakeReq('/api/workshop/github/oauth/callback?code=abc&state=not-real')
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
  })

  it('handles access_denied gracefully', async () => {
    const hs = tokenCache.allocateHandshakeId('user-43')
    const req = fakeReq(`/api/workshop/github/oauth/callback?error=access_denied&state=${hs}`)
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))
    expect((res as unknown as { body: string }).body).toContain('access_denied')
    tokenCache.delete(hs)
  })

  it('returns popup HTML with error when token exchange fails (no access_token)', async () => {
    const hs = tokenCache.allocateHandshakeId('user-44')
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
    expect(tokenCache.get(hs)).toBeUndefined()
    tokenCache.delete(hs)
  })

  it('missing code with pending state returns 400', async () => {
    const hs = tokenCache.allocateHandshakeId('user-45')
    const req = fakeReq(`/api/workshop/github/oauth/callback?state=${hs}`)
    const res = fakeRes()
    await handleOAuthCallback(req, res, new URL(`http://x${req.url!}`))
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
    tokenCache.delete(hs)
  })
})
