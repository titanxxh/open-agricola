// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('browser API requests', () => {
  it('sends the current browser protocol with cookies while preserving request headers and body', async () => {
    const { browserApiFetch } = await import('../browser-api')
    const response = new Response(JSON.stringify({ ok: true }))
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await expect(browserApiFetch('/api/auth/login', {
      method: 'POST', headers: new Headers({ 'content-type': 'application/json', 'x-oa-browser-protocol': '1' }),
      body: '{"username":"alice"}', signal: controller.signal,
    })).resolves.toBe(response)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/auth/login')
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', body: '{"username":"alice"}', signal: controller.signal })
    expect(new Headers(init.headers).get('x-oa-browser-protocol')).toBe('2')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
  })

  it('notifies the application to reload and stops API work after a protocol rejection', async () => {
    const { browserApiFetch, getBrowserReloadRequired, subscribeBrowserReload } = await import('../browser-api')
    const response = new Response(JSON.stringify({ ok: false, code: 'reload_required' }), { status: 426 })
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    const changed = vi.fn()
    const unsubscribe = subscribeBrowserReload(changed)
    await expect(browserApiFetch('/api/auth/me')).resolves.toBe(response)
    expect(changed).toHaveBeenCalledOnce()
    expect(getBrowserReloadRequired()).toBe(true)
    await expect(browserApiFetch('/api/prerelease/handoffs', { method: 'POST' })).rejects.toThrow('reload_required')
    expect(fetchMock).toHaveBeenCalledOnce()
    unsubscribe()
  })
})
