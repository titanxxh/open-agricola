import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetCardsManifestCache,
  getCardMeta,
  loadCardsManifest,
  type CardMeta,
  type CardsManifestPayload,
} from '../card-meta'

const samplePayload: CardsManifestPayload = {
  A123_FrameBuilder: {
    meta: {
      id: 'A123_FrameBuilder',
      name: 'Frame Builder',
      deck: 'A',
      number: 123,
      desc: ['test desc'],
      cost: {},
    },
    module: 'shared/cards/A/A123_FrameBuilder',
    reaches: [],
  },
  Major_Fireplace1: {
    meta: {
      id: 'Major_Fireplace1',
      name: '',
      deck: 'major',
      number: 1,
      cost: { clay: 2 },
      desc: ['[Anytime]'],
      vp: 1,
      isCookery: true,
      isBaking: true,
    },
    module: 'shared/cards/major/fireplace',
    reaches: [],
  },
}

const makeFetchResponse = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as Response

describe('card-meta service', () => {
  const fetchSpy = vi.fn<typeof fetch>()

  beforeEach(() => {
    __resetCardsManifestCache()
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(makeFetchResponse(samplePayload))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads manifest once and flattens payload to id → meta', async () => {
    const map = await loadCardsManifest()
    expect(map.A123_FrameBuilder?.name).toBe('Frame Builder')
    expect(map.Major_Fireplace1?.isCookery).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // second call reuses cache
    const map2 = await loadCardsManifest()
    expect(map2).toBe(map)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('getCardMeta returns undefined before manifest loads and meta afterwards', async () => {
    expect(getCardMeta('A123_FrameBuilder')).toBeUndefined()
    await loadCardsManifest()
    const meta = getCardMeta('A123_FrameBuilder') as CardMeta
    expect(meta.deck).toBe('A')
    expect(meta.desc).toEqual(['test desc'])
  })

  it('dedupes concurrent loads', async () => {
    const [a, b] = await Promise.all([loadCardsManifest(), loadCardsManifest()])
    expect(a).toBe(b)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('fetches manifest from BASE_URL + cards-manifest.json', async () => {
    await loadCardsManifest()
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/cards-manifest\.json$/))
  })
})
