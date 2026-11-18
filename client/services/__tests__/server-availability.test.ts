// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** A fetch stub answering the health probe with `health` and this frontend's own build file with `frontend`. */
function stubFetch(health: () => Promise<Response>, frontend: () => Promise<Response> = async () => new Response('{}')) {
  const fetchMock = vi.fn(async (url: string) => (url.includes('/api/health') ? health() : frontend()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const json = (status: number, body: unknown = {}) => async () => new Response(JSON.stringify(body), { status })
const unreachable = async (): Promise<Response> => { throw new TypeError('Failed to fetch') }

describe('server availability probe', () => {
  it.each([
    ['a healthy server', json(200, { ok: true }), 'up'],
    ["Caddy's uniform 503", json(503, { ok: false, code: 'server_unavailable' }), 'unavailable'],
    ['a closed pre gateway', json(503, { ok: false, code: 'prerelease_maintenance' }), 'unavailable'],
    ['a bare 502', json(502), 'unavailable'],
    ['a gateway timeout', json(504), 'unavailable'],
    ['a server that answers with another error', json(500), 'up'],
  ])('classifies %s', async (_, health, expected) => {
    const fetchMock = stubFetch(health)
    const { probeServer } = await import('../server-availability')
    await expect(probeServer()).resolves.toBe(expected)
    // The probe is a plain GET without credentials or custom headers, so no CORS preflight precedes it.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/health$/)
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' })
    expect(init.headers).toBeUndefined()
  })

  it('tells an unreadable server from a lost connection by this frontend\'s own origin', async () => {
    stubFetch(unreachable)
    const reachable = await import('../server-availability')
    await expect(reachable.probeServer()).resolves.toBe('unavailable')
    vi.resetModules()
    stubFetch(unreachable, unreachable)
    const offline = await import('../server-availability')
    await expect(offline.probeServer()).resolves.toBe('offline')
  })

  it('publishes the result, retries every 15 s while unavailable and announces the recovery once', async () => {
    vi.useFakeTimers()
    let down = true
    const fetchMock = stubFetch(async () => (down ? new Response('{}', { status: 503 }) : new Response('{"ok":true}')))
    const availability = await import('../server-availability')
    const recovered = vi.fn()
    availability.onServerRecovered(recovered)

    // Concurrent checks share one probe.
    const [first, second] = await Promise.all([availability.checkServerAvailability(), availability.checkServerAvailability()])
    expect([first, second, availability.getServerAvailability()]).toEqual(['unavailable', 'unavailable', 'unavailable'])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(availability.SERVER_RETRY_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(recovered).not.toHaveBeenCalled()

    down = false
    await vi.advanceTimersByTimeAsync(availability.SERVER_RETRY_MS)
    expect(availability.getServerAvailability()).toBe('up')
    expect(recovered).toHaveBeenCalledTimes(1)
    // Once up, nothing keeps probing.
    await vi.advanceTimersByTimeAsync(availability.SERVER_RETRY_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('probes at once on a manual retry instead of waiting for the next 15 s', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(json(503))
    const availability = await import('../server-availability')
    await availability.checkServerAvailability()
    await availability.retryServerNow()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The replaced retry does not fire on top of the manual one.
    await vi.advanceTimersByTimeAsync(availability.SERVER_RETRY_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('asks nothing while the page is being left, since a navigation cancels its requests', async () => {
    const fetchMock = stubFetch(unreachable, unreachable)
    const availability = await import('../server-availability')
    window.dispatchEvent(new Event('pagehide'))
    await expect(availability.checkServerAvailability()).resolves.toBe('unknown')
    expect(fetchMock).not.toHaveBeenCalled()
    // A page restored from the back-forward cache probes again.
    window.dispatchEvent(new Event('pageshow'))
    await expect(availability.checkServerAvailability()).resolves.toBe('offline')
  })

  it('recognises the unavailable answers of the API', async () => {
    const { isServerUnavailableCode, isServerUnavailableStatus } = await import('../server-availability')
    expect(['server_unavailable', 'prerelease_maintenance', 'invalid_login', undefined].map(isServerUnavailableCode)).toEqual([true, true, false, false])
    expect([502, 503, 504, 500, 401, 200].map(isServerUnavailableStatus)).toEqual([true, true, true, false, false, false])
  })
})
