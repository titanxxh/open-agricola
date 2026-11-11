import { afterEach, expect, it, vi } from 'vitest'
import { preparePrereleaseHandoff } from '../prerelease'

afterEach(() => vi.restoreAllMocks())

const formalOrigin = 'https://formal.agricola.test'
const input = { targetOrigin: 'https://pre.agricola.test', returnTo: `${formalOrigin}/`, browserChallenge: 'a'.repeat(43), state: 's'.repeat(43) }
const issued = { ok: true, protocolVersion: 1, code: 'c'.repeat(43), expiresAt: 160_000,
  callbackUrl: 'https://pre.agricola.test/open-agricola/auth/handoff', returnTo: input.returnTo }
const api = (result: unknown = issued) => vi.fn()
  .mockResolvedValueOnce(Response.json({ ok: true, protocolVersion: 1, entry: {
    kind: 'available', channel: 'prerelease', startUrl: 'https://pre.agricola.test/open-agricola/auth/start', returnTo: input.returnTo,
  } }))
  .mockResolvedValueOnce(Response.json(result))

it.each([98_000, 100_000, 165_000])('passes the source-issued code to its fixed callback independently of browser clock %i', async browserNow => {
  // The source issued at 100000 with a 60000 ms TTL; browser time is independent.
  vi.spyOn(Date, 'now').mockReturnValue(browserNow)
  const destination = new URL(await preparePrereleaseHandoff(api(), input, formalOrigin))
  expect(destination.origin).toBe('https://pre.agricola.test')
  expect(destination.pathname).toBe('/open-agricola/auth/handoff')
  expect(destination.search).toBe('')
  expect(Object.fromEntries(new URLSearchParams(destination.hash.slice(1)))).toEqual({
    protocolVersion: '1', code: 'c'.repeat(43), state: 's'.repeat(43), browserChallenge: 'a'.repeat(43), returnTo: 'https://formal.agricola.test/',
  })
})

it.each([
  { name: 'missing expiry', value: { ...issued, expiresAt: undefined } },
  { name: 'text expiry', value: { ...issued, expiresAt: '160000' } },
  { name: 'zero expiry', value: { ...issued, expiresAt: 0 } },
  { name: 'negative expiry', value: { ...issued, expiresAt: -1 } },
  { name: 'fractional expiry', value: { ...issued, expiresAt: 160_000.5 } },
  { name: 'unsafe expiry', value: { ...issued, expiresAt: Number.MAX_SAFE_INTEGER + 1 } },
  { name: 'unexpected protocol', value: { ...issued, protocolVersion: 2 } },
  { name: 'malformed code', value: { ...issued, code: 'bad' } },
  { name: 'unexpected callback', value: { ...issued, callbackUrl: 'https://evil.test/handoff' } },
  { name: 'unexpected return root', value: { ...issued, returnTo: 'https://evil.test/' } },
])('rejects $name without changing the configured destination', async ({ value }) => {
  await expect(preparePrereleaseHandoff(api(value), input, formalOrigin)).rejects.toMatchObject({ kind: 'invalid' })
})

it('requires the current source target before requesting a code', async () => {
  const apiFetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, protocolVersion: 1, entry: {
    kind: 'available', channel: 'prerelease', startUrl: 'https://other.agricola.test/open-agricola/auth/start', returnTo: input.returnTo,
  } }))
  await expect(preparePrereleaseHandoff(apiFetch, input, formalOrigin)).rejects.toMatchObject({ kind: 'invalid' })
  expect(apiFetch).toHaveBeenCalledTimes(1)
})
