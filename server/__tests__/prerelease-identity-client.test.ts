import { expect, it } from 'vitest'
import { FormalPrereleaseIdentityClient, parsePrereleaseIdentityState } from '../prerelease-identity-client'
import { readPrereleaseRuntime } from '../prerelease-sessions'

const runtime = { buildId: 'a'.repeat(40), generationId: '00000000-0000-4000-8000-000000000001', appOrigin: 'https://pre.example.test', formalAppOrigin: 'https://play.example.test', formalApiBase: 'https://api.example.test', targetId: 'prerelease-main' }
const state = { protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId: runtime.generationId, grantId: 'g'.repeat(43), account: { kind: 'active', subject: { id: 'formal-user', username: 'player', displayName: 'Player', email: 'must-not-copy@example.test' } }, source: { kind: 'active', expiresAt: 1_800_604_800_000 }, grant: { kind: 'active', expiresAt: 1_800_604_800_000 }, betaAccess: true, confirmedAt: 1_800_000_000_000, validUntil: 1_800_000_030_000 }

it('uses only the restricted server credential and selects the minimal bound authority projection', async () => {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = []
  const client = new FormalPrereleaseIdentityClient(runtime, 'restricted-key-with-at-least32bytes', async (input, init) => {
    requests.push({ url: String(input), init })
    return new Response(JSON.stringify({ ok: true, state }), { status: 200 })
  })
  expect((await client.status('g'.repeat(43))).account).toEqual({ kind: 'active', subject: { id: 'formal-user', username: 'player', displayName: 'Player' } })
  expect(requests[0]?.url).toBe('https://api.example.test/api/prerelease/status')
  expect(requests[0]?.init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', headers: { authorization: 'Bearer restricted-key-with-at-least32bytes', 'content-type': 'application/json' } })
  expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({ protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId: runtime.generationId, grantId: 'g'.repeat(43) })
  for (const altered of [{ ...state, targetOrigin: runtime.formalAppOrigin }, { ...state, generationId: 'other' }, { ...state, validUntil: 1_800_000_030_001 }]) expect(() => parsePrereleaseIdentityState(altered, runtime)).toThrow()
  expect(() => parsePrereleaseIdentityState(state, runtime, 'x'.repeat(43))).toThrow()
})

it('requires isolated HTTPS runtime facts even in development and strips only the hosted frontend mount', () => {
  const env = { RELEASE_CHANNEL: 'prerelease', NODE_ENV: 'development', PUBLIC_APP_ORIGIN: runtime.appOrigin + '/open-agricola/', PUBLIC_API_BASE: runtime.appOrigin,
    FORMAL_APP_ORIGIN: runtime.formalAppOrigin, FORMAL_API_BASE: runtime.formalApiBase, PRERELEASE_TARGET_ID: runtime.targetId, PRERELEASE_DATA_GENERATION: runtime.generationId, GAME_BUILD_ID: runtime.buildId, PRERELEASE_IDENTITY_SERVICE_KEY: 'restricted-key-with-at-least32bytes' }
  expect(readPrereleaseRuntime(env)).toEqual(runtime)
  expect(() => readPrereleaseRuntime({ ...env, PRERELEASE_IDENTITY_SERVICE_KEY: '' })).toThrow()
  expect(() => readPrereleaseRuntime({ ...env, PUBLIC_APP_ORIGIN: runtime.formalAppOrigin, PUBLIC_API_BASE: runtime.formalAppOrigin })).toThrow()
  expect(() => readPrereleaseRuntime({ ...env, PUBLIC_APP_ORIGIN: 'http://pre.example.test' })).toThrow()
  expect(readPrereleaseRuntime({ RELEASE_CHANNEL: 'stable' })).toBeUndefined()
})
