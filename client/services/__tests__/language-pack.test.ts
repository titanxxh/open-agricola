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
afterEach(() => vi.unstubAllGlobals())

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
})
