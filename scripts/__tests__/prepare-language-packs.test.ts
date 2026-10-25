import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareLanguagePacks } from '../prepare-language-packs'

const roots: string[] = []
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agricola-language-cache-'))
  roots.push(root)
  const source = JSON.stringify({ $name: 'Français', ui: { title: 'Ferme' } })
  const pack = JSON.stringify({ version: 1, locale: 'fr', messages: { 'ui.title': 'Ferme' } })
  const file = `fr.${digest(pack).slice(0, 16)}.json`
  const manifest = JSON.stringify({ version: 1, defaultLocale: 'fr', languages: [{
    id: 'fr', name: 'Français', file, sha256: digest(pack), sourceSha256: digest(source),
  }] })
  for (const [path, text] of Object.entries({
    'i18n.ref': JSON.stringify({ repository: 'owner/languages', revision: 'a'.repeat(40), manifestSha256: digest(manifest) }),
    'public/i18n/manifest.json': manifest, [`public/i18n/${file}`]: pack, 'output/i18n/locales/fr.json': source,
  })) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, text)
  }
  vi.stubEnv('AGRICOLA_I18N_DIR', '')
  return { root, file, pack }
}

describe('pinned language package preparation', () => {
  it('uses the verified cache without making a network request', async () => {
    const { root, file, pack } = fixture()
    const fetch = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetch)
    expect((await prepareLanguagePacks(root)).defaultLocale).toBe('fr')
    expect(readFileSync(join(root, 'public/i18n', file), 'utf8')).toBe(pack)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('replaces corrupt cached data with content that matches the pinned hash', async () => {
    const { root, file, pack } = fixture()
    writeFileSync(join(root, 'public/i18n', file), 'corrupt')
    const fetch = vi.fn().mockResolvedValue(new Response(pack))
    vi.stubGlobal('fetch', fetch)
    await prepareLanguagePacks(root)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(root, 'public/i18n', file), 'utf8')).toBe(pack)
  })
})
