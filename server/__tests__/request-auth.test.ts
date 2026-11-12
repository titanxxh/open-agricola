import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { httpAdmission, requestSessionToken, websocketAdmission } from '../request-auth'

const app = 'https://open-agricola.titanxxh.com'
const api = 'https://openagapi.titanxxh.com'
function request(path: string, headers: IncomingMessage['headers'] = {}, method = 'GET') {
  const req = new IncomingMessage(new Socket())
  req.url = path
  req.method = method
  req.headers = { host: 'openagapi.titanxxh.com', ...headers }
  return req
}
const browser = { origin: app, 'x-oa-browser-protocol': '2', cookie: '__Host-oa-session=current' }

describe('formal request admission', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PUBLIC_APP_ORIGIN', app)
    vi.stubEnv('PUBLIC_API_BASE', api)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('admits the formal page while refusing sibling reads and writes before a handler runs', () => {
    for (const method of ['GET', 'POST', 'HEAD', 'DELETE']) {
      expect(httpAdmission(request('/api/auth/me', browser, method))).toEqual({ ok: true })
      expect(requestSessionToken(request('/api/auth/me', browser, method))).toBe('current')
      const sibling = request('/api/auth/me', { ...browser, origin: 'https://pre.titanxxh.com' }, method)
      expect(httpAdmission(sibling)).toMatchObject({ ok: false, code: 'csrf_rejected' })
      expect(requestSessionToken(sibling)).toBe('')
    }
  })

  it('rejects an old formal page even when a new session cookie is present', () => {
    for (const path of ['/api/auth/me', '/api/auth/login', '/api/prerelease/handoffs']) {
      expect(httpAdmission(request(path, { origin: app, cookie: browser.cookie }))).toMatchObject({ ok: false, code: 'reload_required' })
    }
  })

  it('never upgrades absent or opaque Origin into browser authority', () => {
    for (const origin of [undefined, 'null', 'https://open-agricola.titanxxh.com/path']) {
      const req = request('/api/auth/me', { ...browser, origin, 'sec-fetch-site': 'same-site' })
      expect(httpAdmission(req)).toMatchObject({ ok: false })
      expect(requestSessionToken(req)).toBe('')
    }
    expect(httpAdmission(request('/api/auth/me', { ...browser, host: 'pre.titanxxh.com' }))).toMatchObject({ ok: false })
  })

  it('allows a current same-origin client but not an unversioned cached client', () => {
    const headers = { cookie: browser.cookie, 'sec-fetch-site': 'same-origin', 'x-oa-browser-protocol': '2' }
    expect(httpAdmission(request('/api/auth/me', headers))).toEqual({ ok: true })
    expect(httpAdmission(request('/api/auth/me', { ...headers, 'x-oa-browser-protocol': undefined }))).toMatchObject({ code: 'reload_required' })
  })

  it('preserves explicit native tokens without mixing or falling back between transports', () => {
    expect(requestSessionToken(request('/api/auth/me', { authorization: 'Bearer native-token' }))).toBe('native-token')
    expect(requestSessionToken(request('/api/auth/me', { ...browser, authorization: 'Bearer invalid' }))).toBe('')
    expect(requestSessionToken(request('/api/auth/me', { ...browser, cookie: '__Host-oa-session=one; __Host-oa-session=two' }))).toBe('')
    expect(requestSessionToken(request('/api/auth/me', { ...browser, cookie: 'oa_session=legacy' }))).toBe('')
    expect(requestSessionToken(request('/api/auth/me', { authorization: 'Bearer token, other' }))).toBe('')
  })

  it('does not read credentials on public or service routes', () => {
    expect(requestSessionToken(request('/api/health', browser))).toBe('')
    expect(requestSessionToken(request('/api/v1/replays/room/manifest', browser))).toBe('')
    expect(httpAdmission(request('/api/prerelease/status', { authorization: 'Bearer service' }, 'POST'))).toEqual({ ok: true })
    expect(httpAdmission(request('/api/prerelease/status', { ...browser, authorization: 'Bearer service' }, 'POST'))).toMatchObject({ ok: false })
  })

  it('bounds navigation exceptions to top-level documents without opening arbitrary private GETs', () => {
    const headers = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'cross-site' }
    expect(httpAdmission(request('/api/auth/oauth/github/callback?state=test', headers))).toEqual({ ok: true })
    expect(httpAdmission(request('/api/auth/oauth/github/callback?state=test', { ...headers, 'sec-fetch-dest': 'iframe' }))).toMatchObject({ ok: false })
    expect(httpAdmission(request('/api/auth/me', headers))).toMatchObject({ ok: false })
  })

  it('keeps operations resources usable while excluding sibling requests and frames', () => {
    const headers = { cookie: '__Host-oa-ops-session=ops-token', 'sec-fetch-site': 'same-origin' }
    expect(requestSessionToken(request('/ops/public/image.svg', headers), true)).toBe('ops-token')
    expect(httpAdmission(request('/ops/api/ds/query', { ...headers, origin: api }, 'POST'))).toEqual({ ok: true })
    expect(httpAdmission(request('/ops/api/ds/query', headers, 'POST'))).toMatchObject({ ok: false })
    expect(httpAdmission(request('/ops/public/image.svg', { ...headers, 'sec-fetch-site': 'same-site', referer: 'https://pre.titanxxh.com/' }))).toMatchObject({ ok: false })
    expect(httpAdmission(request('/ops/start?ticket=x', { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' }))).toMatchObject({ ok: false })
    expect(requestSessionToken(request('/api/auth/me', { ...browser, cookie: '__Host-oa-ops-session=ops-token' }))).toBe('')
  })

  it('rejects browser WebSocket upgrades without the exact origin and current protocol', () => {
    const headers = { origin: app, cookie: browser.cookie, 'sec-websocket-protocol': 'oa.browser.v2' }
    expect(websocketAdmission(request('/ws', headers))).toEqual({ ok: true })
    expect(websocketAdmission(request('/ws', { ...headers, origin: 'https://pre.titanxxh.com' }))).toMatchObject({ ok: false })
    expect(websocketAdmission(request('/ws', { ...headers, 'sec-websocket-protocol': undefined }))).toMatchObject({ code: 'reload_required' })
    expect(websocketAdmission(request('/ws', { cookie: browser.cookie }))).toMatchObject({ ok: false })
    expect(websocketAdmission(request('/ws'))).toEqual({ ok: true })
  })
})
