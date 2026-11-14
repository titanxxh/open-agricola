import { describe, expect, it } from 'vitest'
import { assertPagesBackendReady } from '../ci/pages-backend'

const candidateSha = 'a'.repeat(40)
const target = { candidateSha, apiBase: 'https://api.example', appOrigin: 'https://app.example' }
const policy = { version: 2, buildId: candidateSha, apiOrigin: 'https://api.example', appOrigin: 'https://app.example' }

describe('Pages live backend admission', () => {
  it('reads only public readiness endpoints without credentials, redirects or unbounded waits', async () => {
    const calls: { url: string; method: string | undefined; redirect: RequestRedirect | undefined; credentials: RequestCredentials | undefined; headers: string[]; bounded: boolean }[] = []
    await assertPagesBackendReady({ ...target, request: async (input, init) => {
      const url = String(input)
      calls.push({ url, method: init?.method, redirect: init?.redirect, credentials: init?.credentials,
        headers: [...new Headers(init?.headers).keys()], bounded: init?.signal instanceof AbortSignal })
      return Response.json(url.endsWith('/api/health') ? { ok: true } : policy)
    } })
    expect(calls).toEqual([
      { url: 'https://api.example/api/health', method: 'GET', redirect: 'error', credentials: 'omit', headers: ['accept'], bounded: true },
      { url: 'https://api.example/api/auth/browser-policy', method: 'GET', redirect: 'error', credentials: 'omit', headers: ['accept'], bounded: true },
    ])
  })

  it.each([
    { apiBase: undefined }, { appOrigin: undefined }, { apiBase: 'http://api.example' },
    { apiBase: 'https://user:secret@api.example' }, { apiBase: 'https://api.example/other' },
    { appOrigin: 'https://app.example/?token=private' },
  ])('rejects invalid configured origins before a network request: %j', async overrides => {
    let requests = 0
    await expect(assertPagesBackendReady({ ...target, ...overrides, request: async () => {
      requests += 1
      return Response.json({ ok: true })
    } })).rejects.toThrow()
    expect(requests).toBe(0)
  })

  it.each(['status', 'content type', 'large body', 'malformed JSON', 'unavailable', 'redirect'])('blocks %s readiness rather than accepting partial evidence', async failure => {
    await expect(assertPagesBackendReady({ ...target, request: async input => {
      if (String(input).endsWith('/api/health')) return Response.json({ ok: true })
      if (failure === 'unavailable' || failure === 'redirect') throw new TypeError('fetch failed')
      if (failure === 'status') return Response.json(policy, { status: 503 })
      if (failure === 'content type') return new Response(JSON.stringify(policy))
      if (failure === 'large body') return Response.json({ padding: 'x'.repeat(17 * 1024) })
      return new Response('{', { headers: { 'content-type': 'application/json' } })
    } })).rejects.toThrow()
  })
})
