import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetCardsManifestCache,
  getCardMeta,
  loadCardsManifest,
  type CardMeta,
  type CardsManifestPayload,
} from '../card-meta'
import {
  clearCustomCardMetadata,
  registerCustomCardMetadata,
} from '../../../shared/cards/custom-card-metadata'

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

const makeFetchResponse = (body: unknown) => new Response(JSON.stringify(body))
const manifestHash = createHash('sha256').update(JSON.stringify(samplePayload)).digest('hex')

describe('card-meta service', () => {
  const fetchSpy = vi.fn<typeof fetch>()

  beforeEach(() => {
    __resetCardsManifestCache()
    clearCustomCardMetadata()
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue(makeFetchResponse(samplePayload))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
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
    expect(fetchSpy).toHaveBeenCalledWith('/cards-manifest.json', { cache: 'no-cache' })
  })

  it.each(['/', '/open-agricola/', './'])('loads the pinned content from the %s application base', async base => {
    vi.stubEnv('BASE_URL', base)
    vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', manifestHash)

    await loadCardsManifest()

    expect(getCardMeta('A123_FrameBuilder')?.name).toBe('Frame Builder')
    expect(fetchSpy).toHaveBeenCalledWith(`${base}cards-manifest.${manifestHash}.json`, { cache: 'force-cache' })
  })

  it('repairs corrupt cached content once before publishing card metadata', async () => {
    vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', manifestHash)
    fetchSpy.mockResolvedValueOnce(makeFetchResponse({})).mockResolvedValueOnce(makeFetchResponse(samplePayload))

    await loadCardsManifest()

    expect(getCardMeta('A123_FrameBuilder')?.name).toBe('Frame Builder')
    expect(fetchSpy.mock.calls.map(([, init]) => init?.cache)).toEqual(['force-cache', 'reload'])
  })

  it('rejects repeated corruption and allows a later successful load', async () => {
    vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', manifestHash)
    fetchSpy.mockResolvedValueOnce(makeFetchResponse({})).mockResolvedValueOnce(makeFetchResponse({}))

    await expect(loadCardsManifest()).rejects.toThrow('checksum')
    expect(getCardMeta('A123_FrameBuilder')).toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    await loadCardsManifest()
    expect(getCardMeta('A123_FrameBuilder')?.name).toBe('Frame Builder')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('does not treat network failure as cached corruption', async () => {
    vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', manifestHash)
    fetchSpy.mockRejectedValueOnce(new Error('offline'))

    await expect(loadCardsManifest()).rejects.toThrow('offline')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await loadCardsManifest()
    expect(getCardMeta('A123_FrameBuilder')?.name).toBe('Frame Builder')
  })

  it('repairs a cached missing-file response before publishing card metadata', async () => {
    vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', manifestHash)
    fetchSpy.mockResolvedValueOnce(new Response('missing', { status: 404 }))

    await loadCardsManifest()

    expect(getCardMeta('A123_FrameBuilder')?.name).toBe('Frame Builder')
    expect(fetchSpy.mock.calls.map(([, init]) => init?.cache)).toEqual(['force-cache', 'reload'])
  })

  it('bounds repeated missing-file responses and repairs the cache on a later retry', async () => {
    vi.stubEnv('VITE_CARDS_MANIFEST_SHA256', manifestHash)
    fetchSpy.mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))

    await expect(loadCardsManifest()).rejects.toThrow('manifest fetch failed 404')
    expect(getCardMeta('A123_FrameBuilder')).toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    await loadCardsManifest()
    expect(getCardMeta('A123_FrameBuilder')?.name).toBe('Frame Builder')
    expect(fetchSpy.mock.calls.map(([, init]) => init?.cache)).toEqual(['force-cache', 'reload', 'force-cache', 'reload'])
  })

  it('preserves supplemental rules and locales from runtime custom-card metadata', () => {
    registerCustomCardMetadata({
      cardType: 'occupation',
      cardJson: {
        id: 'CUSTOM_LocalisedCard',
        name: 'Localised Card',
        deck: 'CUSTOM',
        number: 0,
        desc: ['English description.'],
        rules: ['Supplemental ruling.'],
        cost: {},
        artUrl: 'https://attacker.example/tracker.webp',
        locales: {
          zh: {
            name: '本地化卡',
            desc: ['中文描述。'],
            rules: ['补充裁定。'],
          },
        },
      },
    })

    expect(getCardMeta('CUSTOM_LocalisedCard')?.rules).toEqual([
      'Supplemental ruling.',
    ])
    expect(getCardMeta('CUSTOM_LocalisedCard')?.locales?.zh).toEqual({
      name: '本地化卡',
      desc: ['中文描述。'],
      rules: ['补充裁定。'],
    })
    expect(getCardMeta('CUSTOM_LocalisedCard')?.artUrl).toBeUndefined()
  })
})
