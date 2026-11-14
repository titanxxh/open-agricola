// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://pre.agricola.test/"}
import { createHash } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'

const build = 'a'.repeat(40)
const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const payload = {
  A123_FrameBuilder: {
    meta: { id: 'A123_FrameBuilder', name: 'Frame Builder', deck: 'A', number: 123 },
    module: 'shared/cards/A/A123_FrameBuilder', reaches: [],
  },
}
const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex')

async function prepare(activate: boolean) {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease')
  vi.stubEnv('VITE_GAME_BUILD_ID', build)
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
    ok: true, channel: 'prerelease', buildId: build, generationId: generation,
    appOrigin: 'https://pre.agricola.test', formalAppOrigin: 'https://formal.agricola.test',
    formalApiBase: 'https://api.agricola.test', targetId: 'prerelease-main',
  }))
  vi.stubGlobal('fetch', fetchMock)
  const runtime = await import('../prerelease-runtime')
  await runtime.loadPrereleaseRuntime()
  if (activate) runtime.acceptPrereleaseSession({
    ok: true, user: { id: 'u1', username: 'beta', displayName: 'Beta', isAdmin: false, betaAccess: true },
    prerelease: { buildId: build, generationId: generation, expiresAt: Date.now() + 60_000,
      validUntil: Date.now() + 30_000, serverTime: Date.now() },
  })
  return { fetchMock, runtime, cards: await import('../card-meta') }
}

afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.each([undefined, fingerprint])('requires an active lease before fetching manifest %s', async hash => {
  vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', hash)
  const { cards, fetchMock } = await prepare(false)

  await expect(cards.loadCardsManifest()).rejects.toThrow('prerelease_auth_required')

  expect(fetchMock).toHaveBeenCalledOnce()
  expect(cards.hasCardsManifest()).toBe(false)
})

it('preserves fingerprint repair and binds both requests to the active build and generation', async () => {
  vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', fingerprint)
  const { cards, fetchMock } = await prepare(true)
  fetchMock.mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json(payload))

  await cards.loadCardsManifest()

  expect(cards.getCardMeta('A123_FrameBuilder')?.name).toBe('Frame Builder')
  const requests = fetchMock.mock.calls.slice(1)
  expect(requests.map(([url, init]) => [url, init?.cache, init?.credentials])).toEqual([
    [`/cards-manifest.${fingerprint}.json`, 'force-cache', 'include'],
    [`/cards-manifest.${fingerprint}.json`, 'reload', 'include'],
  ])
  for (const [, init] of requests) {
    expect(new Headers(init?.headers).get('x-oa-pre-build')).toBe(build)
    expect(new Headers(init?.headers).get('x-oa-pre-generation')).toBe(generation)
    expect(new Headers(init?.headers).get('x-oa-browser-protocol')).toBe('2')
  }
  await cards.loadCardsManifest()
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('rejects correctly fingerprinted bytes arriving after a known access denial', async () => {
  vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', fingerprint)
  const { cards, fetchMock, runtime } = await prepare(true)
  let finish: (response: Response) => void = () => { throw new Error('No manifest request') }
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  const loading = cards.loadCardsManifest()
  runtime.rejectPrereleaseAccess('prerelease_access_expired')
  finish(Response.json(payload))

  await expect(loading).rejects.toThrow('prerelease_access_expired')

  expect(cards.hasCardsManifest()).toBe(false)
  expect(cards.getCardMeta('A123_FrameBuilder')).toBeUndefined()
  await expect(cards.loadCardsManifest()).rejects.toThrow('prerelease_access_expired')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
