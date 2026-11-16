import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION, BROWSER_WS_PROTOCOL } from '../../shared/contract/browser-auth'
import { allowAnonymousAccess } from '../anonymous-access'
import { requestSessionToken, websocketSessionToken } from '../request-auth'

const request = (headers: IncomingMessage['headers']): IncomingMessage => ({
  method: 'GET', url: '/api/auth/me', headers,
} as IncomingMessage)

afterEach(() => vi.unstubAllEnvs())

describe('prerelease credential boundary', () => {
  it('never enables anonymous access through a development or explicit override', () => {
    expect(allowAnonymousAccess({ NODE_ENV: 'development', RELEASE_CHANNEL: 'prerelease', ALLOW_ANONYMOUS_WS: 'true' })).toBe(false)
  })

  it('reads only the dedicated host-only pre cookie for HTTP and WebSocket', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://pre.example.test')
    vi.stubEnv('PUBLIC_API_BASE', 'https://pre.example.test')
    const headers = { host: 'pre.example.test', origin: 'https://pre.example.test',
      [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION), 'sec-websocket-protocol': BROWSER_WS_PROTOCOL }
    const foreign = '__Host-oa-session=formal; oa_dev_session=development; __Host-oa-ops-session=owner'
    expect(requestSessionToken(request({ ...headers, cookie: foreign }))).toBe('')
    expect(websocketSessionToken(request({ ...headers, cookie: foreign }))).toBe('')
    const pre = { ...headers, cookie: `${foreign}; __Host-oa-pre-session=pre-only` }
    expect(requestSessionToken(request(pre))).toBe('pre-only')
    expect(websocketSessionToken(request(pre))).toBe('pre-only')
    expect(requestSessionToken(request({ ...headers, authorization: 'Bearer pre-only' }))).toBe('')
  })
})
