import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const raw = JSON.stringify({ version: 1, locale: 'fr', messages: {
  'ui.title': 'Ferme', 'ui.waiting': 'Attendre {player} avec {card:C112_Thresher}',
} })
const cardsRaw = JSON.stringify({ version: 1, locale: 'fr', messages: { 'cardFaces.C112_Thresher.name': 'Batteur' } })
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const sha256 = digest(raw)
const cardsSha256 = digest(cardsRaw)
const manifest = { version: 2, defaultLocale: 'fr', languages: [{
  id: 'fr', name: 'Français',
  core: { file: `fr.${sha256.slice(0, 16)}.json`, sha256 },
  cards: { file: `fr-cards.${cardsSha256.slice(0, 16)}.json`, sha256: cardsSha256 },
  sourceSha256: sha256,
}] }
const coreFile = manifest.languages[0].core.file
const cardsFile = manifest.languages[0].cards.file

beforeEach(() => vi.resetModules())
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('independent language packages', () => {
  it('loads verified bootstrap language before a prerelease session exists', async () => {
    vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(manifest))
      .mockResolvedValueOnce(new Response(raw))
    vi.stubGlobal('fetch', fetchMock)
    const { loadLanguageManifest, loadLanguagePack } = await import('../language-pack')

    const languages = await loadLanguageManifest()
    await loadLanguagePack(languages.defaultLocale)

    const { t } = await import('../../../shared/i18n')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(fetchMock.mock.calls).toEqual([
      ['/i18n/manifest.json', { cache: 'no-cache' }],
      [`/i18n/${manifest.languages[0].file}`, { cache: 'force-cache' }],
    ])
  })

  it('loads a manifest-defined locale without loading English and coalesces concurrent requests', async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest)) : new Response(url.endsWith(cardsFile) ? cardsRaw : raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack } = await import('../language-pack')
    await Promise.all([loadLanguagePack('fr'), loadLanguagePack('fr')])
    const { t, hasCardTextPack } = await import('../../../shared/i18n')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(hasCardTextPack('fr')).toBe(false)
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/i18n/manifest.json', `/i18n/${coreFile}`])
  })

  it('adds the Card Text Pack to the same locale once it arrives', async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest)) : new Response(url.endsWith(cardsFile) ? cardsRaw : raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack, loadCardTextPack, hasFullLanguage } = await import('../language-pack')
    await loadLanguagePack('fr')
    const { t, cardText } = await import('../../../shared/i18n')
    expect(t('fr', 'ui.waiting', { player: 'Ada' })).toBe('Attendre Ada avec {card:C112_Thresher}')
    expect(hasFullLanguage('fr')).toBe(false)

    await Promise.all([loadCardTextPack('fr'), loadCardTextPack('fr')])
    expect(hasFullLanguage('fr')).toBe(true)
    expect(cardText('fr', 'C112_Thresher').name).toBe('Batteur')
    expect(t('fr', 'ui.waiting', { player: 'Ada' })).toBe('Attendre Ada avec Batteur')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/i18n/manifest.json', `/i18n/${coreFile}`, `/i18n/${cardsFile}`])
  })

  it('loads both parts before a full language is ready and keeps the core when card text fails', async () => {
    let cardsAvailable = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith(cardsFile)
      ? new Response(cardsAvailable ? cardsRaw : 'missing', { status: cardsAvailable ? 200 : 404 }) : new Response(raw)))
    vi.stubEnv('VITE_LANGUAGE_MANIFEST', JSON.stringify(manifest))
    const { loadFullLanguage, hasFullLanguage } = await import('../language-pack')
    await expect(loadFullLanguage('fr')).rejects.toThrow('Language unavailable (404)')
    const { hasLanguagePack, hasCardTextPack } = await import('../../../shared/i18n')
    expect(hasLanguagePack('fr')).toBe(true)
    expect(hasCardTextPack('fr')).toBe(false)
    cardsAvailable = true
    await loadFullLanguage('fr')
    expect(hasFullLanguage('fr')).toBe(true)
  })

  it('uses the language list carried by the build and requests only the pack', async () => {
    vi.stubEnv('VITE_LANGUAGE_MANIFEST', JSON.stringify(manifest))
    const fetch = vi.fn(async () => new Response(raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack, getLanguageManifest } = await import('../language-pack')
    await loadLanguagePack('fr')
    expect(getLanguageManifest()?.defaultLocale).toBe('fr')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/i18n/${coreFile}`])
  })

  it('rejects a corrupt package and permits a successful retry', async () => {
    let corrupt = true
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest)) : new Response(corrupt ? '{}' : raw)))
    const { loadLanguagePack } = await import('../language-pack')
    await expect(loadLanguagePack('fr')).rejects.toThrow('checksum')
    const { hasLanguagePack } = await import('../../../shared/i18n')
    expect(hasLanguagePack('fr')).toBe(false)
    corrupt = false
    await loadLanguagePack('fr')
    expect(hasLanguagePack('fr')).toBe(true)
  })

  it('revalidates the language list while reusing a verified content-named pack', async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest)) : new Response(raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack, getLanguageManifest } = await import('../language-pack')

    await loadLanguagePack('fr')

    const { t } = await import('../../../shared/i18n')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(getLanguageManifest()?.defaultLocale).toBe('fr')
    expect(fetch).toHaveBeenNthCalledWith(1, '/i18n/manifest.json', { cache: 'no-cache' })
    expect(fetch).toHaveBeenNthCalledWith(2, `/i18n/${coreFile}`, { cache: 'force-cache' })
  })

  it('repairs corrupt cached language bytes once and publishes the repaired translation', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack } = await import('../language-pack')

    await loadLanguagePack('fr')

    const { t } = await import('../../../shared/i18n')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(fetch.mock.calls.map(([, init]) => init?.cache)).toEqual(['no-cache', 'force-cache', 'reload'])
  })

  it('repairs a cached missing language package before publishing its translations', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response(raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack } = await import('../language-pack')

    await loadLanguagePack('fr')

    const { t } = await import('../../../shared/i18n')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(fetch.mock.calls.map(([, init]) => init?.cache)).toEqual(['no-cache', 'force-cache', 'reload'])
  })

  it('bounds missing language package retries and permits later recovery', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response(raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack } = await import('../language-pack')

    await expect(loadLanguagePack('fr')).rejects.toThrow('Language unavailable (404)')
    const { hasLanguagePack, t } = await import('../../../shared/i18n')
    expect(hasLanguagePack('fr')).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(3)

    await loadLanguagePack('fr')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(fetch.mock.calls.map(([, init]) => init?.cache)).toEqual(['no-cache', 'force-cache', 'reload', 'force-cache', 'reload'])
  })
})
