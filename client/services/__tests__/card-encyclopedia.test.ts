import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EncyclopediaEntry, EncyclopediaSearchDocument } from '../../../shared/contract/card-encyclopedia'

const entry: EncyclopediaEntry = {
  key: 'card:A004_Baseboards',
  sourceKind: 'card',
  sourceId: 'A004_Baseboards',
  group: 'A',
  publicType: 'minor',
  displayNumber: 'A004',
  players: null,
  face: { kind: 'card', cardId: 'A004_Baseboards', cardType: 'minor' },
  text: { name: [{ key: 'cardFaces.A004_Baseboards.name' }], body: [{ key: 'cardFaces.A004_Baseboards.description' }] },
  cost: { kind: 'printed', paths: [{ food: 2 }, { grain: 1 }] },
  score: { fixed: null, extraVp: false },
}
const document: EncyclopediaSearchDocument = {
  key: 'card:A004_Baseboards',
  identifiers: ['A004_Baseboards', 'A004'],
  locales: { en: { name: { text: 'Baseboards', status: 'localized' } }, zh: { name: { text: '踢脚板', status: 'localized' } } },
  extraTerms: ['Wood', '木材', '木头'],
}
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const catalogText = JSON.stringify({ version: 1, entries: [entry] })
const searchText = JSON.stringify({ version: 1, languages: ['en', 'zh'], documents: [document] })
const manifest = {
  version: 1,
  entryCount: 1,
  languages: ['en', 'zh'],
  catalog: { file: `catalog.${sha256(catalogText).slice(0, 16)}.json`, sha256: sha256(catalogText) },
  search: { file: `search.${sha256(searchText).slice(0, 16)}.json`, sha256: sha256(searchText) },
}

type Served = { manifest?: unknown; catalog?: string; search?: string; status?: number }
const serve = (served: Served = {}) => vi.fn(async (url: string, _init?: RequestInit) => {
  if (served.status) return new Response('unavailable', { status: served.status })
  if (url.endsWith('/manifest.json')) return new Response(JSON.stringify(served.manifest ?? manifest))
  if (url.endsWith(manifest.catalog.file)) return new Response(served.catalog ?? catalogText)
  if (url.endsWith(manifest.search.file)) return new Response(served.search ?? searchText)
  return new Response('missing', { status: 404 })
})

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('card encyclopedia loader', () => {
  it('fetches nothing until the encyclopedia is opened, then loads, indexes and caches both files once', async () => {
    const fetch = serve()
    vi.stubGlobal('fetch', fetch)
    const { loadCardEncyclopedia } = await import('../card-encyclopedia')
    expect(fetch).not.toHaveBeenCalled()

    const [first, second] = await Promise.all([loadCardEncyclopedia(), loadCardEncyclopedia()])
    const again = await loadCardEncyclopedia()

    expect(second).toBe(first)
    expect(again).toBe(first)
    expect(first.entries).toEqual([entry])
    expect(first.documents).toEqual([document])
    expect(first.languages).toEqual(['en', 'zh'])
    expect(first.byKey.get('card:A004_Baseboards')).toEqual({ entry, document })
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.cache])).toEqual([
      ['/card-encyclopedia/manifest.json', 'no-cache'],
      [`/card-encyclopedia/${manifest.catalog.file}`, undefined],
      [`/card-encyclopedia/${manifest.search.file}`, undefined],
    ])
  })

  it('rejects a file whose checksum does not match and loads on retry', async () => {
    let corrupt = true
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) =>
      serve({ search: corrupt ? searchText.replace('Baseboards', 'Tampered') : searchText })(url, init)))
    const { loadCardEncyclopedia } = await import('../card-encyclopedia')

    await expect(loadCardEncyclopedia()).rejects.toThrow('checksum')
    corrupt = false
    await expect(loadCardEncyclopedia()).resolves.toMatchObject({ entries: [entry] })
  })

  it('rejects an unavailable server and loads on retry', async () => {
    let status: number | undefined = 503
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => serve({ status })(url, init)))
    const { loadCardEncyclopedia } = await import('../card-encyclopedia')

    await expect(loadCardEncyclopedia()).rejects.toThrow('503')
    status = undefined
    await expect(loadCardEncyclopedia()).resolves.toMatchObject({ documents: [document] })
  })

  it('rejects a manifest that is not a card encyclopedia list', async () => {
    vi.stubGlobal('fetch', serve({ manifest: { ...manifest, catalog: { file: '../secrets.json', sha256: manifest.catalog.sha256 } } }))
    const { loadCardEncyclopedia } = await import('../card-encyclopedia')
    await expect(loadCardEncyclopedia()).rejects.toThrow('Invalid card encyclopedia list')
  })

  it('rejects search documents that do not line up with the catalog', async () => {
    const shuffled = JSON.stringify({ version: 1, languages: ['en', 'zh'], documents: [{ ...document, key: 'card:A005_Other' }] })
    const shuffledManifest = { ...manifest, search: { file: `search.${sha256(shuffled).slice(0, 16)}.json`, sha256: sha256(shuffled) } }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json')) return new Response(JSON.stringify(shuffledManifest))
      return new Response(url.endsWith(shuffledManifest.search.file) ? shuffled : catalogText)
    }))
    const { loadCardEncyclopedia } = await import('../card-encyclopedia')
    await expect(loadCardEncyclopedia()).rejects.toThrow('card:A004_Baseboards')
  })
})
