import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { corsHeaders, isTrustedOrigin } from '../http-origin.ts'

const req = (headers: IncomingMessage['headers']): IncomingMessage => ({
  headers,
} as IncomingMessage)

describe('http origin helpers', () => {
  afterEach(() => {
    delete process.env.CORS_ORIGIN
    delete process.env.PUBLIC_APP_ORIGIN
  })

  it('trusts PUBLIC_APP_ORIGIN by origin even when it has a path base', () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example/open-agricola/'

    expect(isTrustedOrigin(req({
      origin: 'https://frontend.example',
      host: 'api.example',
      'x-forwarded-proto': 'https',
    }))).toBe(true)
    expect(isTrustedOrigin(req({
      origin: 'https://evil.example',
      host: 'api.example',
      'x-forwarded-proto': 'https',
    }))).toBe(false)
  })

  it('rejects opaque or malformed origin headers', () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://frontend.example'

    expect(isTrustedOrigin(req({
      origin: 'null',
      host: 'api.example',
      'x-forwarded-proto': 'https',
    }))).toBe(false)
    expect(isTrustedOrigin(req({
      origin: 'not a url',
      host: 'api.example',
      'x-forwarded-proto': 'https',
    }))).toBe(false)
  })

  it('does not trust a sibling, a missing origin, or request-derived host metadata', () => {
    process.env.PUBLIC_APP_ORIGIN = 'https://open-agricola.titanxxh.com'
    for (const origin of [undefined, 'https://pre.titanxxh.com', 'https://open-agricola.titanxxh.com/path']) {
      expect(isTrustedOrigin(req({ origin, host: 'pre.titanxxh.com', 'x-forwarded-proto': 'https' }))).toBe(false)
    }
  })

  it('adds credentialed CORS headers for explicit CORS origins', () => {
    process.env.CORS_ORIGIN = 'https://frontend.example'

    expect(corsHeaders()).toMatchObject({
      'Access-Control-Allow-Origin': 'https://frontend.example',
      'Access-Control-Allow-Credentials': 'true',
    })
  })
})
