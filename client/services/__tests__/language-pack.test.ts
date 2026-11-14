import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const raw = JSON.stringify({ version: 1, locale: 'fr', messages: {
  'ui.title': 'Ferme', 'ui.waiting': 'Attendre {player}', 'cardFaces.C112_Thresher.name': 'Batteur',
} })
const sha256 = createHash('sha256').update(raw).digest('hex')
const manifest = { version: 1, defaultLocale: 'fr', languages: [{
  id: 'fr', name: 'Français', file: `fr.${sha256.slice(0, 16)}.json`, sha256, sourceSha256: sha256,
}] }

beforeEach(() => vi.resetModules())
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('independent language packages', () => {
  it('loads a manifest-defined locale without loading English and coalesces concurrent requests', async () => {
    const fetch = vi.fn(async (url: string) => url.endsWith('manifest.json')
      ? new Response(JSON.stringify(manifest)) : new Response(raw))
    vi.stubGlobal('fetch', fetch)
    const { loadLanguagePack } = await import('../language-pack')
    await Promise.all([loadLanguagePack('fr'), loadLanguagePack('fr')])
    const { t, cardText } = await import('../../../shared/i18n')
    expect(t('fr', 'ui.title')).toBe('Ferme')
    expect(t('fr', 'ui.waiting', { player: '{other}' })).toBe('Attendre {other}')
    expect(cardText('fr', 'C112_Thresher').name).toBe('Batteur')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/i18n/manifest.json', `/i18n/${manifest.languages[0].file}`])
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
    expect(fetch).toHaveBeenNthCalledWith(2, `/i18n/${manifest.languages[0].file}`, { cache: 'force-cache' })
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
